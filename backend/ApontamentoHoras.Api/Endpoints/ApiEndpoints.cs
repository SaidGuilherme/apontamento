using ApontamentoHoras.Api.Contracts;
using ApontamentoHoras.Api.Data;
using ApontamentoHoras.Api.Models;
using ApontamentoHoras.Api.Services;
using Microsoft.EntityFrameworkCore;

namespace ApontamentoHoras.Api.Endpoints;

public static class ApiEndpoints
{
    private const string XlsxContentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    public static void MapApi(this WebApplication app)
    {
        var api = app.MapGroup("/api");

        api.MapGet("/health", () => Results.Ok(new { status = "ok" }));

        MapSettings(api.MapGroup("/settings"));
        MapTaskTypes(api.MapGroup("/task-types"));
        MapRedmine(api.MapGroup("/redmine"));
        MapImports(api.MapGroup("/imports"));
    }

    private static void MapSettings(RouteGroupBuilder g)
    {
        g.MapGet("", async (SettingsService s, CancellationToken ct) => s.ToDto(await s.GetAsync(ct)));

        g.MapPut("", (UpdateSettingsRequest req, SettingsService s, CancellationToken ct) => s.UpdateAsync(req, ct));

        g.MapPost("/redmine/test", async (TestRedmineRequest req, SettingsService s, RedmineClient redmine, CancellationToken ct) =>
        {
            var conn = await s.GetTestConnectionAsync(req, ct);
            return await CallRedmine(() => redmine.GetCurrentUserAsync(conn, ct));
        });
    }

    private static void MapTaskTypes(RouteGroupBuilder g)
    {
        g.MapGet("", async (AppDbContext db, CancellationToken ct) =>
            await db.TaskTypes.OrderBy(x => x.SortOrder).ThenBy(x => x.Name)
                .Select(x => new TaskTypeDto(x.Id, x.Name, x.SortOrder))
                .ToListAsync(ct));

        g.MapPost("", async (SaveTaskTypeRequest req, AppDbContext db, CancellationToken ct) =>
        {
            var name = ValidateTaskTypeName(req.Name);
            if (await db.TaskTypes.AnyAsync(x => x.Name.ToLower() == name.ToLower(), ct))
                throw new AppException($"O tipo \"{name}\" já existe.", StatusCodes.Status409Conflict);

            var order = req.SortOrder ?? ((await db.TaskTypes.MaxAsync(x => (int?)x.SortOrder, ct) ?? 0) + 1);
            var entity = new TaskType { Name = name, SortOrder = order };
            db.TaskTypes.Add(entity);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/task-types/{entity.Id}", new TaskTypeDto(entity.Id, entity.Name, entity.SortOrder));
        });

        g.MapPut("/{id:int}", async (int id, SaveTaskTypeRequest req, AppDbContext db, CancellationToken ct) =>
        {
            var entity = await db.TaskTypes.FindAsync([id], ct)
                         ?? throw new AppException("Tipo de tarefa não encontrado.", StatusCodes.Status404NotFound);
            var name = ValidateTaskTypeName(req.Name);
            if (await db.TaskTypes.AnyAsync(x => x.Id != id && x.Name.ToLower() == name.ToLower(), ct))
                throw new AppException($"O tipo \"{name}\" já existe.", StatusCodes.Status409Conflict);

            entity.Name = name;
            if (req.SortOrder is { } order) entity.SortOrder = order;
            await db.SaveChangesAsync(ct);
            return new TaskTypeDto(entity.Id, entity.Name, entity.SortOrder);
        });

        g.MapDelete("/{id:int}", async (int id, AppDbContext db, CancellationToken ct) =>
        {
            var entity = await db.TaskTypes.FindAsync([id], ct);
            if (entity is null) return Results.NoContent();
            db.TaskTypes.Remove(entity);
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });
    }

    private static void MapRedmine(RouteGroupBuilder g)
    {
        g.MapGet("/projects", async (SettingsService s, RedmineClient redmine, CancellationToken ct) =>
        {
            var conn = await s.GetConnectionAsync(ct);
            return await CallRedmine(() => redmine.GetProjectsAsync(conn, ct));
        });

        g.MapGet("/activities", async (SettingsService s, RedmineClient redmine, CancellationToken ct) =>
        {
            var conn = await s.GetConnectionAsync(ct);
            return await CallRedmine(() => redmine.GetActivitiesAsync(conn, ct));
        });

        g.MapGet("/issues", async (int? projectId, string? q, SettingsService s, RedmineClient redmine, CancellationToken ct) =>
        {
            var conn = await s.GetConnectionAsync(ct);
            return await CallRedmine(() => redmine.GetIssuesAsync(conn, projectId, q, ct));
        });

        g.MapGet("/issues/{id:int}", async (int id, SettingsService s, RedmineClient redmine, CancellationToken ct) =>
        {
            var conn = await s.GetConnectionAsync(ct);
            return await CallRedmine(() => redmine.GetIssueAsync(conn, id, ct));
        });
    }

    private static void MapImports(RouteGroupBuilder g)
    {
        g.MapGet("", (ImportService s, CancellationToken ct) => s.ListAsync(ct));

        // Lê o formulário direto do HttpRequest para não depender de antiforgery (a API é local e sem login).
        g.MapPost("", async (HttpRequest request, ImportService s, CancellationToken ct) =>
        {
            if (!request.HasFormContentType)
                throw new AppException("Envie o arquivo CSV no campo \"file\".");

            var form = await request.ReadFormAsync(ct);
            var file = form.Files.GetFile("file") ?? form.Files.FirstOrDefault()
                       ?? throw new AppException("Envie o arquivo CSV no campo \"file\".");
            if (file.Length == 0)
                throw new AppException("O arquivo está vazio.");

            await using var stream = file.OpenReadStream();
            var import = await s.CreateFromCsvAsync(file.FileName, stream, ct);
            return Results.Created($"/api/imports/{import.Id}", import);
        });

        g.MapGet("/{id:int}", (int id, ImportService s, CancellationToken ct) => s.GetAsync(id, ct));

        g.MapPut("/{id:int}", (int id, UpdateImportRequest req, ImportService s, CancellationToken ct) => s.UpdateAsync(id, req, ct));

        g.MapDelete("/{id:int}", async (int id, ImportService s, CancellationToken ct) =>
        {
            await s.DeleteAsync(id, ct);
            return Results.NoContent();
        });

        g.MapDelete("/{id:int}/items/{itemId:int}", (int id, int itemId, ImportService s, CancellationToken ct) =>
            s.DeleteItemAsync(id, itemId, ct));

        g.MapGet("/{id:int}/xlsx", async (int id, ImportService s, CancellationToken ct) =>
        {
            var (content, fileName) = await s.ExportXlsxAsync(id, ct);
            return Results.File(content, XlsxContentType, fileName);
        });

        g.MapGet("/{id:int}/redmine", (int id, ImportService s, CancellationToken ct) => s.GetRedminePreviewAsync(id, ct));

        g.MapPost("/{id:int}/redmine/send", (int id, SendToRedmineRequest? req, ImportService s, CancellationToken ct) =>
            s.SendToRedmineAsync(id, req ?? new SendToRedmineRequest(null), ct));
    }

    private static string ValidateTaskTypeName(string? name)
    {
        var trimmed = (name ?? "").Trim();
        if (trimmed.Length == 0) throw new AppException("Informe o nome do tipo de tarefa.");
        if (trimmed.Length > 100) throw new AppException("O nome do tipo pode ter no máximo 100 caracteres.");
        return trimmed;
    }

    /// <summary>Converte falhas do Redmine em 502 com a mensagem do Redmine.</summary>
    private static async Task<IResult> CallRedmine<T>(Func<Task<T>> call)
    {
        try
        {
            return Results.Ok(await call());
        }
        catch (RedmineException ex)
        {
            throw new AppException(ex.Message, StatusCodes.Status502BadGateway);
        }
    }
}
