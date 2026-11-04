using ApontamentoHoras.Api.Contracts;
using ApontamentoHoras.Api.Data;
using ApontamentoHoras.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace ApontamentoHoras.Api.Services;

public class ImportService(
    AppDbContext db,
    SettingsService settingsService,
    CsvImportService csvImport,
    XlsxExportService xlsxExport,
    RedmineClient redmine,
    ILogger<ImportService> logger)
{
    // ---------- importação e edição ----------

    public async Task<ImportDto> CreateFromCsvAsync(string fileName, Stream content, CancellationToken ct)
    {
        var rows = csvImport.Parse(content);
        var settings = await settingsService.GetAsync(ct);

        var import = new Import
        {
            FileName = string.IsNullOrWhiteSpace(fileName) ? "importacao.csv" : Path.GetFileName(fileName),
            CreatedAt = DateTime.UtcNow,
            IssueId = settings.DefaultIssueId,
            IssueSubject = settings.DefaultIssueSubject,
            Items = rows.Select(r => new ImportItem
            {
                RowNumber = r.RowNumber,
                Project = settings.DefaultProjectName,
                WorkItemId = r.WorkItemId,
                WorkItemType = r.WorkItemType,
                Title = r.Title,
                CompletedWork = r.CompletedWork,
                AssignedTo = r.AssignedTo,
                State = r.State,
                ClosedDate = r.ClosedDate,
                SpentOn = DefaultSpentOn(r.Title, r.ClosedDate),
            }).ToList(),
        };

        db.Imports.Add(import);
        await db.SaveChangesAsync(ct);
        return ToDto(import);
    }

    public async Task<List<ImportSummaryDto>> ListAsync(CancellationToken ct)
    {
        return await db.Imports
            .OrderByDescending(i => i.CreatedAt)
            .Select(i => new ImportSummaryDto(
                i.Id,
                i.FileName,
                i.CreatedAt,
                i.Items.Count,
                i.Items.Sum(x => x.CompletedWork ?? 0),
                i.Items.Count(x => x.CompletedWork == null || x.CompletedWork <= 0),
                i.Items.Count(x => x.RedmineStatus == RedmineStatus.Sent),
                i.Items.Count(x => x.RedmineStatus == RedmineStatus.Error)))
            .ToListAsync(ct);
    }

    public async Task<ImportDto> GetAsync(int id, CancellationToken ct) => ToDto(await LoadAsync(id, ct));

    public async Task<ImportDto> UpdateAsync(int id, UpdateImportRequest req, CancellationToken ct)
    {
        var import = await LoadAsync(id, ct);
        import.IssueId = req.IssueId;
        import.IssueSubject = req.IssueId is null ? null : req.IssueSubject;

        var byId = import.Items.ToDictionary(x => x.Id);
        foreach (var r in req.Items)
        {
            if (!byId.TryGetValue(r.Id, out var item))
                throw new AppException($"A linha {r.Id} não pertence a esta importação.");

            if (r.CompletedWork is < 0)
                throw new AppException($"Linha {item.RowNumber}: Completed Work não pode ser negativo.");

            item.Project = (r.Project ?? "").Trim();
            item.WorkItemId = r.WorkItemId;
            item.WorkItemType = (r.WorkItemType ?? "").Trim();
            item.TaskType = string.IsNullOrWhiteSpace(r.TaskType) ? null : r.TaskType.Trim();
            item.Title = (r.Title ?? "").Trim();
            item.CompletedWork = r.CompletedWork is null ? null : Math.Round(r.CompletedWork.Value, 2, MidpointRounding.AwayFromZero);
            item.AssignedTo = (r.AssignedTo ?? "").Trim();
            item.State = (r.State ?? "").Trim();
            item.ClosedDate = r.ClosedDate is null ? null : DateTime.SpecifyKind(r.ClosedDate.Value, DateTimeKind.Unspecified);
            item.SpentOn = r.SpentOn;
            item.RedmineIssueId = r.RedmineIssueId;
        }

        await db.SaveChangesAsync(ct);
        return ToDto(import);
    }

    public async Task DeleteAsync(int id, CancellationToken ct)
    {
        var import = await db.Imports.FirstOrDefaultAsync(i => i.Id == id, ct)
                     ?? throw new AppException("Importação não encontrada.", StatusCodes.Status404NotFound);
        db.Imports.Remove(import);
        await db.SaveChangesAsync(ct);
    }

    public async Task<ImportDto> DeleteItemAsync(int importId, int itemId, CancellationToken ct)
    {
        var import = await LoadAsync(importId, ct);
        var item = import.Items.FirstOrDefault(x => x.Id == itemId)
                   ?? throw new AppException("Linha não encontrada.", StatusCodes.Status404NotFound);
        if (item.RedmineStatus == RedmineStatus.Sent)
            throw new AppException("Esta linha já foi lançada no Redmine e não pode ser removida daqui.");

        import.Items.Remove(item);
        db.ImportItems.Remove(item);
        await db.SaveChangesAsync(ct);
        return ToDto(import);
    }

    // ---------- xlsx ----------

    public async Task<(byte[] Content, string FileName)> ExportXlsxAsync(int id, CancellationToken ct)
    {
        var import = await LoadAsync(id, ct);
        var items = import.Items.OrderBy(x => x.RowNumber).ToList();
        if (items.Count == 0)
            throw new AppException("A importação não tem linhas.");

        var missing = items.Where(x => x.CompletedWork is null or <= 0).ToList();
        if (missing.Count > 0)
            throw new AppException(
                $"Preencha o Completed Work de {missing.Count} linha(s) antes de gerar o xlsx.",
                details: missing.Select(x => $"Linha {x.RowNumber} · ID {x.WorkItemId}: {x.Title}").ToList());

        var baseName = Path.GetFileNameWithoutExtension(import.FileName);
        return (xlsxExport.Build(items), $"{baseName} - apontamento.xlsx");
    }

    // ---------- Redmine ----------

    public async Task<RedminePreviewDto> GetRedminePreviewAsync(int id, CancellationToken ct)
    {
        var import = await LoadAsync(id, ct);
        var settings = await settingsService.GetAsync(ct);
        return await BuildPreviewAsync(import, settings, ct);
    }

    public async Task<SendToRedmineResult> SendToRedmineAsync(int id, SendToRedmineRequest req, CancellationToken ct)
    {
        var import = await LoadAsync(id, ct);
        var settings = await settingsService.GetAsync(ct);
        var conn = await settingsService.GetConnectionAsync(ct);
        if (settings.DefaultActivityId is not { } activityId)
            throw new AppException("Escolha a atividade padrão do Redmine na tela de configurações.", StatusCodes.Status409Conflict);

        var preview = await BuildPreviewAsync(import, settings, ct);
        var wanted = req.ItemIds is { Count: > 0 } ? req.ItemIds.ToHashSet() : null;
        var targets = preview.Items.Where(p => p.CanSend && (wanted is null || wanted.Contains(p.ItemId))).ToList();
        if (targets.Count == 0)
            throw new AppException("Nenhum lançamento pronto para enviar.");

        var items = import.Items.ToDictionary(x => x.Id);
        int sent = 0, failed = 0;

        foreach (var target in targets)
        {
            var item = items[target.ItemId];
            try
            {
                var entryId = await redmine.CreateTimeEntryAsync(conn,
                    new NewTimeEntry(target.IssueId!.Value, target.SpentOn!.Value, target.Hours!.Value, activityId, target.Comment),
                    ct);

                item.RedmineStatus = RedmineStatus.Sent;
                item.RedmineTimeEntryId = entryId;
                item.RedmineSentIssueId = target.IssueId;
                item.RedmineSentAt = DateTime.UtcNow;
                item.RedmineError = null;
                sent++;
            }
            catch (RedmineException ex)
            {
                logger.LogWarning("Falha ao lançar a linha {Row} no Redmine: {Message}", item.RowNumber, ex.Message);
                item.RedmineStatus = RedmineStatus.Error;
                item.RedmineError = ex.Message;
                failed++;

                // Sem conexão, as próximas também falhariam: para aqui e salva o que já foi feito.
                if (ex.IsConnectionError)
                {
                    await db.SaveChangesAsync(CancellationToken.None);
                    break;
                }
            }

            // Salva a cada linha para não perder o registro do que já entrou no Redmine.
            await db.SaveChangesAsync(CancellationToken.None);
        }

        var updated = await BuildPreviewAsync(import, settings, ct);
        return new SendToRedmineResult(sent, failed, updated);
    }

    private async Task<RedminePreviewDto> BuildPreviewAsync(Import import, AppSettings settings, CancellationToken ct)
    {
        var globalProblems = new List<string>();
        var configured = settingsService.TryGetConnection(settings) is not null;
        if (!configured) globalProblems.Add("Configure a URL e a chave de API do Redmine.");
        if (settings.DefaultActivityId is null) globalProblems.Add("Escolha a atividade padrão do Redmine.");

        var workItemIds = import.Items.Select(x => x.WorkItemId).Distinct().ToList();
        var sentElsewhere = await db.ImportItems
            .AsNoTracking()
            .Where(x => x.RedmineStatus == RedmineStatus.Sent && workItemIds.Contains(x.WorkItemId))
            .Select(x => new { x.Id, x.WorkItemId, x.ImportId })
            .ToListAsync(ct);

        var defaultIssue = import.IssueId ?? settings.DefaultIssueId;
        var defaultIssueSubject = import.IssueId is not null ? import.IssueSubject : settings.DefaultIssueSubject;

        var items = new List<RedminePreviewItemDto>();
        foreach (var item in import.Items.OrderBy(x => x.RowNumber))
        {
            var problems = new List<string>();
            PreviewStatus status;
            int? duplicateOf = null;

            var issueId = item.RedmineStatus == RedmineStatus.Sent
                ? item.RedmineSentIssueId ?? item.RedmineIssueId ?? defaultIssue
                : item.RedmineIssueId ?? defaultIssue;

            if (item.RedmineStatus == RedmineStatus.Sent)
            {
                status = PreviewStatus.Sent;
            }
            else
            {
                var other = sentElsewhere.FirstOrDefault(s => s.WorkItemId == item.WorkItemId && s.Id != item.Id);
                if (other is not null)
                {
                    duplicateOf = other.ImportId;
                    problems.Add(other.ImportId == import.Id
                        ? $"O work item {item.WorkItemId} já foi lançado em outra linha desta importação."
                        : $"O work item {item.WorkItemId} já foi lançado na importação #{other.ImportId}.");
                }

                if (item.CompletedWork is null or <= 0) problems.Add("Preencha o Completed Work.");
                if (item.SpentOn is null) problems.Add("Defina a data do lançamento.");
                if (issueId is null) problems.Add("Defina a issue que recebe as horas.");

                status = duplicateOf is not null ? PreviewStatus.Duplicate
                    : problems.Count > 0 ? PreviewStatus.Incomplete
                    : item.RedmineStatus == RedmineStatus.Error ? PreviewStatus.Error
                    : PreviewStatus.Ready;
            }

            var canSend = globalProblems.Count == 0 && status is PreviewStatus.Ready or PreviewStatus.Error;

            items.Add(new RedminePreviewItemDto(
                item.Id,
                item.RowNumber,
                item.WorkItemId,
                item.Title,
                TitleParser.StripDate(item.Title),
                item.SpentOn,
                item.CompletedWork,
                issueId,
                item.RedmineIssueId is not null,
                status,
                canSend,
                problems,
                item.RedmineTimeEntryId,
                item.RedmineError,
                duplicateOf));
        }

        var ready = items.Where(x => x.CanSend).ToList();
        return new RedminePreviewDto(
            configured,
            settings.RedmineUrl,
            settings.DefaultActivityId,
            settings.DefaultActivityName,
            defaultIssue,
            defaultIssueSubject,
            globalProblems,
            items.Sum(x => x.Hours ?? 0),
            ready.Count,
            ready.Sum(x => x.Hours ?? 0),
            items);
    }

    // ---------- auxiliares ----------

    private static DateOnly? DefaultSpentOn(string title, DateTime? closedDate) =>
        TitleParser.GetDate(title) ?? (closedDate is { } d ? DateOnly.FromDateTime(d) : null);

    private async Task<Import> LoadAsync(int id, CancellationToken ct) =>
        await db.Imports.Include(i => i.Items).FirstOrDefaultAsync(i => i.Id == id, ct)
        ?? throw new AppException("Importação não encontrada.", StatusCodes.Status404NotFound);

    private static ImportDto ToDto(Import i) => new(
        i.Id,
        i.FileName,
        i.CreatedAt,
        i.IssueId,
        i.IssueSubject,
        i.Items.OrderBy(x => x.RowNumber).Select(x => new ImportItemDto(
            x.Id,
            x.RowNumber,
            x.Project,
            x.WorkItemId,
            x.WorkItemType,
            x.TaskType,
            x.Title,
            x.CompletedWork,
            x.AssignedTo,
            x.State,
            x.ClosedDate,
            x.SpentOn,
            x.RedmineIssueId,
            x.RedmineStatus,
            x.RedmineTimeEntryId,
            x.RedmineSentIssueId,
            x.RedmineError,
            x.RedmineSentAt)).ToList());
}
