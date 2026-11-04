using ApontamentoHoras.Api.Models;

namespace ApontamentoHoras.Api.Contracts;

// ---------- Configurações ----------

public record SettingsDto(
    string? RedmineUrl,
    bool HasApiKey,
    bool RedmineIgnoreSslErrors,
    string DefaultProjectName,
    int? DefaultRedmineProjectId,
    string? DefaultRedmineProjectName,
    int? DefaultIssueId,
    string? DefaultIssueSubject,
    int? DefaultActivityId,
    string? DefaultActivityName);

/// <param name="RedmineApiKey">Nova chave. Nulo ou vazio mantém a atual.</param>
/// <param name="ClearApiKey">Remove a chave salva.</param>
public record UpdateSettingsRequest(
    string? RedmineUrl,
    string? RedmineApiKey,
    bool ClearApiKey,
    bool RedmineIgnoreSslErrors,
    string? DefaultProjectName,
    int? DefaultRedmineProjectId,
    string? DefaultRedmineProjectName,
    int? DefaultIssueId,
    string? DefaultIssueSubject,
    int? DefaultActivityId,
    string? DefaultActivityName);

/// <summary>Valores opcionais para testar antes de salvar. Os ausentes usam o que está salvo.</summary>
public record TestRedmineRequest(string? RedmineUrl, string? RedmineApiKey, bool? RedmineIgnoreSslErrors);

public record TestRedmineResult(int UserId, string Login, string Name);

public record TaskTypeDto(int Id, string Name, int SortOrder);

public record SaveTaskTypeRequest(string Name, int? SortOrder);

// ---------- Importações ----------

public record ImportSummaryDto(
    int Id,
    string FileName,
    DateTime CreatedAt,
    int ItemCount,
    decimal TotalHours,
    int MissingHoursCount,
    int SentCount,
    int ErrorCount);

public record ImportItemDto(
    int Id,
    int RowNumber,
    string Project,
    int WorkItemId,
    string WorkItemType,
    string? TaskType,
    string Title,
    decimal? CompletedWork,
    string AssignedTo,
    string State,
    DateTime? ClosedDate,
    DateOnly? SpentOn,
    int? RedmineIssueId,
    RedmineStatus RedmineStatus,
    int? RedmineTimeEntryId,
    int? RedmineSentIssueId,
    string? RedmineError,
    DateTime? RedmineSentAt);

public record ImportDto(
    int Id,
    string FileName,
    DateTime CreatedAt,
    int? IssueId,
    string? IssueSubject,
    List<ImportItemDto> Items);

public record UpdateItemRequest(
    int Id,
    string? Project,
    int WorkItemId,
    string? WorkItemType,
    string? TaskType,
    string? Title,
    decimal? CompletedWork,
    string? AssignedTo,
    string? State,
    DateTime? ClosedDate,
    DateOnly? SpentOn,
    int? RedmineIssueId);

public record UpdateImportRequest(int? IssueId, string? IssueSubject, List<UpdateItemRequest> Items);

// ---------- Redmine ----------

public enum PreviewStatus
{
    /// <summary>Pronto para enviar.</summary>
    Ready,
    /// <summary>Já enviado nesta linha.</summary>
    Sent,
    /// <summary>O último envio falhou; pode tentar de novo.</summary>
    Error,
    /// <summary>O mesmo work item já foi lançado em outra linha.</summary>
    Duplicate,
    /// <summary>Falta algum dado obrigatório.</summary>
    Incomplete
}

public record RedminePreviewItemDto(
    int ItemId,
    int RowNumber,
    int WorkItemId,
    string Title,
    string Comment,
    DateOnly? SpentOn,
    decimal? Hours,
    int? IssueId,
    bool IssueIsOverride,
    PreviewStatus Status,
    bool CanSend,
    List<string> Problems,
    int? TimeEntryId,
    string? Error,
    int? DuplicateOfImportId);

public record RedminePreviewDto(
    bool Configured,
    string? RedmineUrl,
    int? ActivityId,
    string? ActivityName,
    int? DefaultIssueId,
    string? DefaultIssueSubject,
    List<string> GlobalProblems,
    decimal TotalHours,
    int ReadyCount,
    decimal ReadyHours,
    List<RedminePreviewItemDto> Items);

public record SendToRedmineRequest(List<int>? ItemIds);

public record SendToRedmineResult(int Sent, int Failed, RedminePreviewDto Preview);

public record RedmineProjectDto(int Id, string Name, string Identifier, string? ParentName);

public record RedmineActivityDto(int Id, string Name, bool IsDefault);

public record RedmineIssueDto(int Id, string Subject, string? ProjectName, string? StatusName, string? TrackerName);
