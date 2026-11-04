using System.Globalization;
using System.Text.RegularExpressions;

namespace ApontamentoHoras.Api.Services;

/// <summary>
/// Os títulos seguem o padrão "20260803 - Descrição". A data do início é o dia em que o trabalho foi feito.
/// </summary>
public static partial class TitleParser
{
    [GeneratedRegex(@"^\s*(?<date>\d{8})\s*[-–—:]?\s*")]
    private static partial Regex DatePrefix();

    public static DateOnly? GetDate(string? title)
    {
        if (string.IsNullOrWhiteSpace(title)) return null;
        var match = DatePrefix().Match(title);
        if (!match.Success) return null;
        return DateOnly.TryParseExact(match.Groups["date"].Value, "yyyyMMdd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date)
            ? date
            : null;
    }

    /// <summary>Título sem a data do início. Se não houver data válida, devolve o título inteiro.</summary>
    public static string StripDate(string? title)
    {
        if (string.IsNullOrWhiteSpace(title)) return "";
        if (GetDate(title) is null) return title.Trim();
        var rest = DatePrefix().Replace(title, "", 1).Trim();
        return rest.Length > 0 ? rest : title.Trim();
    }
}
