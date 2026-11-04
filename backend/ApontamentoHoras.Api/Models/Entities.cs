namespace ApontamentoHoras.Api.Models;

/// <summary>Configuração única da aplicação (linha com Id = 1).</summary>
public class AppSettings
{
    public const int SingletonId = 1;
    public const string DefaultProject = "Onboarding Corretor";

    public int Id { get; set; } = SingletonId;

    public string? RedmineUrl { get; set; }

    /// <summary>Chave de API do Redmine, criptografada com ASP.NET Data Protection.</summary>
    public string? RedmineApiKeyProtected { get; set; }

    public bool RedmineIgnoreSslErrors { get; set; }

    /// <summary>Valor padrão da coluna "Projeto" do xlsx.</summary>
    public string DefaultProjectName { get; set; } = DefaultProject;

    /// <summary>Projeto do Redmine usado para listar issues.</summary>
    public int? DefaultRedmineProjectId { get; set; }
    public string? DefaultRedmineProjectName { get; set; }

    /// <summary>Issue que recebe as horas quando a linha e a importação não definem outra.</summary>
    public int? DefaultIssueId { get; set; }
    public string? DefaultIssueSubject { get; set; }

    /// <summary>Atividade usada em todos os lançamentos de horas.</summary>
    public int? DefaultActivityId { get; set; }
    public string? DefaultActivityName { get; set; }
}

public class TaskType
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public int SortOrder { get; set; }
}

public class Import
{
    public int Id { get; set; }
    public string FileName { get; set; } = "";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>Issue padrão desta importação (sobrepõe a das configurações).</summary>
    public int? IssueId { get; set; }
    public string? IssueSubject { get; set; }

    public List<ImportItem> Items { get; set; } = [];
}

public enum RedmineStatus
{
    Pending,
    Sent,
    Error
}

public class ImportItem
{
    public int Id { get; set; }
    public int ImportId { get; set; }
    public Import Import { get; set; } = null!;

    /// <summary>Linha do CSV de origem (o cabeçalho é a linha 1).</summary>
    public int RowNumber { get; set; }

    // Colunas do xlsx
    public string Project { get; set; } = "";
    public int WorkItemId { get; set; }
    public string WorkItemType { get; set; } = "";
    public string? TaskType { get; set; }
    public string Title { get; set; } = "";
    public decimal? CompletedWork { get; set; }
    public string AssignedTo { get; set; } = "";
    public string State { get; set; } = "";
    public DateTime? ClosedDate { get; set; }

    // Lançamento no Redmine
    /// <summary>Data do lançamento. Vem do início do título (yyyyMMdd) ou da Closed Date.</summary>
    public DateOnly? SpentOn { get; set; }

    /// <summary>Issue específica desta linha (sobrepõe a da importação).</summary>
    public int? RedmineIssueId { get; set; }

    public RedmineStatus RedmineStatus { get; set; } = RedmineStatus.Pending;
    public int? RedmineTimeEntryId { get; set; }
    public int? RedmineSentIssueId { get; set; }
    public string? RedmineError { get; set; }
    public DateTime? RedmineSentAt { get; set; }
}
