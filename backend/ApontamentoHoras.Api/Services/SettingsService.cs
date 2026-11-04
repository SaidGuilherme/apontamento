using System.Security.Cryptography;
using ApontamentoHoras.Api.Contracts;
using ApontamentoHoras.Api.Data;
using ApontamentoHoras.Api.Models;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;

namespace ApontamentoHoras.Api.Services;

public class SettingsService(AppDbContext db, IDataProtectionProvider dataProtection)
{
    private readonly IDataProtector _protector = dataProtection.CreateProtector("ApontamentoHoras.RedmineApiKey");

    public async Task<AppSettings> GetAsync(CancellationToken ct)
    {
        var settings = await db.Settings.FirstOrDefaultAsync(x => x.Id == AppSettings.SingletonId, ct);
        if (settings is not null) return settings;

        settings = new AppSettings();
        db.Settings.Add(settings);
        await db.SaveChangesAsync(ct);
        return settings;
    }

    public SettingsDto ToDto(AppSettings s) => new(
        s.RedmineUrl,
        Unprotect(s.RedmineApiKeyProtected) is not null,
        s.RedmineIgnoreSslErrors,
        s.DefaultProjectName,
        s.DefaultRedmineProjectId,
        s.DefaultRedmineProjectName,
        s.DefaultIssueId,
        s.DefaultIssueSubject,
        s.DefaultActivityId,
        s.DefaultActivityName);

    public async Task<SettingsDto> UpdateAsync(UpdateSettingsRequest req, CancellationToken ct)
    {
        var s = await GetAsync(ct);

        s.RedmineUrl = string.IsNullOrWhiteSpace(req.RedmineUrl) ? null : RedmineClient.NormalizeBaseUrl(req.RedmineUrl).TrimEnd('/');
        if (req.ClearApiKey)
            s.RedmineApiKeyProtected = null;
        else if (!string.IsNullOrWhiteSpace(req.RedmineApiKey))
            s.RedmineApiKeyProtected = _protector.Protect(req.RedmineApiKey.Trim());

        s.RedmineIgnoreSslErrors = req.RedmineIgnoreSslErrors;
        s.DefaultProjectName = string.IsNullOrWhiteSpace(req.DefaultProjectName) ? AppSettings.DefaultProject : req.DefaultProjectName.Trim();
        s.DefaultRedmineProjectId = req.DefaultRedmineProjectId;
        s.DefaultRedmineProjectName = req.DefaultRedmineProjectId is null ? null : req.DefaultRedmineProjectName;
        s.DefaultIssueId = req.DefaultIssueId;
        s.DefaultIssueSubject = req.DefaultIssueId is null ? null : req.DefaultIssueSubject;
        s.DefaultActivityId = req.DefaultActivityId;
        s.DefaultActivityName = req.DefaultActivityId is null ? null : req.DefaultActivityName;

        await db.SaveChangesAsync(ct);
        return ToDto(s);
    }

    /// <summary>Conexão com o Redmine a partir do que está salvo, ou null se faltar URL ou chave.</summary>
    public RedmineConnection? TryGetConnection(AppSettings s)
    {
        var key = Unprotect(s.RedmineApiKeyProtected);
        if (string.IsNullOrWhiteSpace(s.RedmineUrl) || string.IsNullOrWhiteSpace(key)) return null;
        return new RedmineConnection(s.RedmineUrl, key, s.RedmineIgnoreSslErrors);
    }

    public async Task<RedmineConnection> GetConnectionAsync(CancellationToken ct)
    {
        var s = await GetAsync(ct);
        return TryGetConnection(s)
               ?? throw new AppException("Configure a URL e a chave de API do Redmine na tela de configurações.", StatusCodes.Status409Conflict);
    }

    /// <summary>Monta a conexão de teste misturando valores digitados com os salvos.</summary>
    public async Task<RedmineConnection> GetTestConnectionAsync(TestRedmineRequest req, CancellationToken ct)
    {
        var s = await GetAsync(ct);
        var url = string.IsNullOrWhiteSpace(req.RedmineUrl) ? s.RedmineUrl : req.RedmineUrl;
        var key = string.IsNullOrWhiteSpace(req.RedmineApiKey) ? Unprotect(s.RedmineApiKeyProtected) : req.RedmineApiKey.Trim();

        if (string.IsNullOrWhiteSpace(url)) throw new AppException("Informe a URL do Redmine.");
        if (string.IsNullOrWhiteSpace(key)) throw new AppException("Informe a chave de API do Redmine.");

        return new RedmineConnection(RedmineClient.NormalizeBaseUrl(url), key, req.RedmineIgnoreSslErrors ?? s.RedmineIgnoreSslErrors);
    }

    private string? Unprotect(string? protectedValue)
    {
        if (string.IsNullOrEmpty(protectedValue)) return null;
        try
        {
            return _protector.Unprotect(protectedValue);
        }
        catch (CryptographicException)
        {
            // As chaves de criptografia foram perdidas (volume apagado). O usuário precisa informar a chave de novo.
            return null;
        }
    }
}
