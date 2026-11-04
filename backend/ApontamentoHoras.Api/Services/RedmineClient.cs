using System.Globalization;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using ApontamentoHoras.Api.Contracts;

namespace ApontamentoHoras.Api.Services;

public record RedmineConnection(string BaseUrl, string ApiKey, bool IgnoreSslErrors);

public record NewTimeEntry(int IssueId, DateOnly SpentOn, decimal Hours, int ActivityId, string Comments);

public class RedmineException(string message, bool isConnectionError = false) : Exception(message)
{
    /// <summary>Não foi possível falar com o servidor (rede, DNS, certificado, timeout).</summary>
    public bool IsConnectionError { get; } = isConnectionError;
}

/// <summary>Cliente mínimo da API REST do Redmine.</summary>
public class RedmineClient(IHttpClientFactory httpClientFactory)
{
    public const string HttpClientName = "redmine";
    public const string InsecureHttpClientName = "redmine-insecure";

    private const int MaxCommentLength = 255;

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public async Task<TestRedmineResult> GetCurrentUserAsync(RedmineConnection conn, CancellationToken ct)
    {
        var res = await GetAsync<UserEnvelope>(conn, "users/current.json", ct);
        var u = res.User;
        return new TestRedmineResult(u.Id, u.Login ?? "", $"{u.Firstname} {u.Lastname}".Trim());
    }

    public async Task<List<RedmineProjectDto>> GetProjectsAsync(RedmineConnection conn, CancellationToken ct)
    {
        var result = new List<RedmineProjectDto>();
        var offset = 0;
        while (true)
        {
            var page = await GetAsync<ProjectsEnvelope>(conn, $"projects.json?limit=100&offset={offset}", ct);
            result.AddRange(page.Projects.Select(p => new RedmineProjectDto(p.Id, p.Name, p.Identifier ?? "", p.Parent?.Name)));
            offset += page.Projects.Count;
            if (page.Projects.Count == 0 || offset >= page.TotalCount) break;
        }
        return result.OrderBy(p => p.ParentName ?? p.Name).ThenBy(p => p.Name).ToList();
    }

    public async Task<List<RedmineActivityDto>> GetActivitiesAsync(RedmineConnection conn, CancellationToken ct)
    {
        var res = await GetAsync<ActivitiesEnvelope>(conn, "enumerations/time_entry_activities.json", ct);
        return res.TimeEntryActivities
            .Where(a => a.Active ?? true)
            .Select(a => new RedmineActivityDto(a.Id, a.Name, a.IsDefault ?? false))
            .ToList();
    }

    /// <summary>Issues abertas do projeto, mais recentes primeiro. Filtra pelo assunto no lado da API desta aplicação.</summary>
    public async Task<List<RedmineIssueDto>> GetIssuesAsync(RedmineConnection conn, int? projectId, string? search, CancellationToken ct)
    {
        var url = "issues.json?status_id=open&sort=updated_on:desc&limit=100";
        if (projectId is not null) url += $"&project_id={projectId}";
        var res = await GetAsync<IssuesEnvelope>(conn, url, ct);
        var issues = res.Issues.Select(ToDto);
        if (!string.IsNullOrWhiteSpace(search))
            issues = issues.Where(i => i.Subject.Contains(search.Trim(), StringComparison.OrdinalIgnoreCase)
                                       || i.Id.ToString(CultureInfo.InvariantCulture) == search.Trim());
        return issues.ToList();
    }

    public async Task<RedmineIssueDto> GetIssueAsync(RedmineConnection conn, int issueId, CancellationToken ct)
    {
        var res = await GetAsync<IssueEnvelope>(conn, $"issues/{issueId}.json", ct);
        return ToDto(res.Issue);
    }

    public async Task<int> CreateTimeEntryAsync(RedmineConnection conn, NewTimeEntry entry, CancellationToken ct)
    {
        var comments = entry.Comments.Length > MaxCommentLength ? entry.Comments[..MaxCommentLength] : entry.Comments;
        var body = new TimeEntryEnvelope(new TimeEntryPayload(
            entry.IssueId,
            entry.SpentOn.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            entry.Hours,
            entry.ActivityId,
            comments));

        using var client = CreateClient(conn);
        HttpResponseMessage response;
        try
        {
            response = await client.PostAsJsonAsync("time_entries.json", body, Json, ct);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            throw ConnectionError(conn, ex);
        }

        using (response)
        {
            await EnsureSuccessAsync(response, ct);
            var created = await response.Content.ReadFromJsonAsync<CreatedTimeEntryEnvelope>(Json, ct);
            return created?.TimeEntry.Id ?? throw new RedmineException("O Redmine não devolveu o ID do lançamento criado.");
        }
    }

    // ---------- infraestrutura ----------

    private HttpClient CreateClient(RedmineConnection conn)
    {
        var client = httpClientFactory.CreateClient(conn.IgnoreSslErrors ? InsecureHttpClientName : HttpClientName);
        client.BaseAddress = new Uri(NormalizeBaseUrl(conn.BaseUrl));
        client.DefaultRequestHeaders.Add("X-Redmine-API-Key", conn.ApiKey);
        client.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        return client;
    }

    public static string NormalizeBaseUrl(string url)
    {
        var trimmed = url.Trim().TrimEnd('/');
        if (!Uri.TryCreate(trimmed + "/", UriKind.Absolute, out var uri) || (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps))
            throw new AppException("A URL do Redmine é inválida. Use o endereço completo, por exemplo https://redmine.suaempresa.com.br");
        return uri.ToString();
    }

    private async Task<T> GetAsync<T>(RedmineConnection conn, string relativeUrl, CancellationToken ct)
    {
        using var client = CreateClient(conn);
        HttpResponseMessage response;
        try
        {
            response = await client.GetAsync(relativeUrl, ct);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            throw ConnectionError(conn, ex);
        }

        using (response)
        {
            await EnsureSuccessAsync(response, ct);
            try
            {
                return await response.Content.ReadFromJsonAsync<T>(Json, ct)
                       ?? throw new RedmineException("O Redmine devolveu uma resposta vazia.");
            }
            catch (JsonException)
            {
                throw new RedmineException("A resposta não veio no formato esperado. Confira se a URL aponta para o Redmine e se a API REST está habilitada.");
            }
        }
    }

    private static RedmineException ConnectionError(RedmineConnection conn, Exception ex)
    {
        var reason = ex is TaskCanceledException ? "o servidor demorou demais para responder" : ex.Message;
        return new RedmineException($"Não foi possível conectar ao Redmine em {conn.BaseUrl}: {reason}. Se ele só abre na rede da empresa, confira a VPN.", isConnectionError: true);
    }

    private static async Task EnsureSuccessAsync(HttpResponseMessage response, CancellationToken ct)
    {
        if (response.IsSuccessStatusCode) return;

        var body = await response.Content.ReadAsStringAsync(ct);
        var redmineErrors = TryReadErrors(body);

        var message = response.StatusCode switch
        {
            HttpStatusCode.Unauthorized => "O Redmine recusou a chave de API. Confira a chave nas configurações.",
            HttpStatusCode.Forbidden => "Sua chave não tem permissão para esta ação no Redmine.",
            HttpStatusCode.NotFound => "Não encontrado no Redmine. Confira o número da issue ou se a API REST está habilitada.",
            HttpStatusCode.UnprocessableEntity => "O Redmine recusou os dados",
            _ => $"O Redmine respondeu com erro {(int)response.StatusCode}",
        };

        if (redmineErrors.Count > 0)
            message = message.TrimEnd('.') + ": " + string.Join("; ", redmineErrors);
        else if (!message.EndsWith('.'))
            message += ".";

        throw new RedmineException(message);
    }

    private static List<string> TryReadErrors(string body)
    {
        if (string.IsNullOrWhiteSpace(body)) return [];
        try
        {
            return JsonSerializer.Deserialize<ErrorsEnvelope>(body, Json)?.Errors ?? [];
        }
        catch (JsonException)
        {
            return [];
        }
    }

    private static RedmineIssueDto ToDto(IssueJson i) =>
        new(i.Id, i.Subject ?? "", i.Project?.Name, i.Status?.Name, i.Tracker?.Name);

    // ---------- formato JSON do Redmine ----------

    private record NamedRef(int Id, string? Name);
    private record UserJson(int Id, string? Login, string? Firstname, string? Lastname);
    private record UserEnvelope(UserJson User);
    private record ProjectJson(int Id, string Name, string? Identifier, NamedRef? Parent);
    private record ProjectsEnvelope(List<ProjectJson> Projects, int TotalCount);
    private record ActivityJson(int Id, string Name, bool? IsDefault, bool? Active);
    private record ActivitiesEnvelope(List<ActivityJson> TimeEntryActivities);
    private record IssueJson(int Id, string? Subject, NamedRef? Project, NamedRef? Status, NamedRef? Tracker);
    private record IssuesEnvelope(List<IssueJson> Issues);
    private record IssueEnvelope(IssueJson Issue);
    private record TimeEntryPayload(int IssueId, string SpentOn, decimal Hours, int ActivityId, string Comments);
    private record TimeEntryEnvelope(TimeEntryPayload TimeEntry);
    private record CreatedTimeEntryJson(int Id);
    private record CreatedTimeEntryEnvelope(CreatedTimeEntryJson TimeEntry);
    private record ErrorsEnvelope(List<string>? Errors);
}
