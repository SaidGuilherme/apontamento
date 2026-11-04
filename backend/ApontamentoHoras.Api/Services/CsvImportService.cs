using System.Globalization;
using System.Text;
using CsvHelper;
using CsvHelper.Configuration;

namespace ApontamentoHoras.Api.Services;

public record ParsedRow(
    int RowNumber,
    int WorkItemId,
    string WorkItemType,
    string Title,
    decimal? CompletedWork,
    string AssignedTo,
    string State,
    DateTime? ClosedDate);

/// <summary>Lê o CSV exportado do Azure DevOps.</summary>
public class CsvImportService
{
    private static readonly (string Key, string Label)[] RequiredColumns =
    [
        ("id", "ID"),
        ("workitemtype", "Work Item Type"),
        ("title", "Title"),
        ("completedwork", "Completed Work"),
        ("assignedto", "Assigned To"),
        ("state", "State"),
        ("closeddate", "Closed Date"),
    ];

    private static readonly string[] DateFormats =
    [
        "dd/MM/yyyy HH:mm:ss",
        "dd/MM/yyyy HH:mm",
        "dd/MM/yyyy",
        "d/M/yyyy H:mm:ss",
        "d/M/yyyy H:mm",
        "d/M/yyyy",
        "yyyy-MM-ddTHH:mm:ss",
        "yyyy-MM-dd HH:mm:ss",
        "yyyy-MM-ddTHH:mm",
        "yyyy-MM-dd",
    ];

    public List<ParsedRow> Parse(Stream stream)
    {
        var text = ReadText(stream);
        if (string.IsNullOrWhiteSpace(text))
            throw new AppException("O arquivo está vazio.");

        var config = new CsvConfiguration(CultureInfo.InvariantCulture)
        {
            DetectDelimiter = true,
            HasHeaderRecord = true,
            TrimOptions = TrimOptions.Trim,
            BadDataFound = null,
            MissingFieldFound = null,
            HeaderValidated = null,
        };

        using var reader = new StringReader(text);
        using var csv = new CsvReader(reader, config);

        if (!csv.Read() || !csv.ReadHeader() || csv.HeaderRecord is null)
            throw new AppException("Não encontrei o cabeçalho do CSV.");

        var header = csv.HeaderRecord.Select(NormalizeHeader).ToList();
        var index = new Dictionary<string, int>();
        var missing = new List<string>();
        foreach (var (key, label) in RequiredColumns)
        {
            var i = header.IndexOf(key);
            if (i < 0) missing.Add(label);
            else index[key] = i;
        }

        if (missing.Count > 0)
            throw new AppException(
                "O CSV não tem todas as colunas esperadas. Faltam: " + string.Join(", ", missing) + ".",
                details: ["Colunas encontradas: " + string.Join(", ", csv.HeaderRecord)]);

        var rows = new List<ParsedRow>();
        var errors = new List<string>();
        var rowNumber = 1;

        while (csv.Read())
        {
            rowNumber++;
            string Get(string key) => (csv.GetField(index[key]) ?? "").Trim();

            var rawId = Get("id");
            var rawTitle = Get("title");
            var rawHours = Get("completedwork");
            var rawClosed = Get("closeddate");

            // Linhas totalmente vazias (comuns no fim do arquivo) são ignoradas.
            if (RequiredColumns.All(c => Get(c.Key).Length == 0)) continue;

            var rowErrors = new List<string>();

            if (!int.TryParse(rawId, NumberStyles.Integer, CultureInfo.InvariantCulture, out var id) || id <= 0)
                rowErrors.Add($"ID \"{rawId}\" não é um número válido");

            if (!TryParseHours(rawHours, out var hours))
                rowErrors.Add($"Completed Work \"{rawHours}\" não é um número válido");
            else if (hours < 0)
                rowErrors.Add("Completed Work não pode ser negativo");

            if (!TryParseDate(rawClosed, out var closed))
                rowErrors.Add($"Closed Date \"{rawClosed}\" não está num formato de data reconhecido");

            if (rowErrors.Count > 0)
            {
                errors.Add($"Linha {rowNumber}: {string.Join("; ", rowErrors)}.");
                continue;
            }

            rows.Add(new ParsedRow(
                rowNumber,
                id,
                Get("workitemtype"),
                rawTitle,
                hours is null ? null : Math.Round(hours.Value, 2, MidpointRounding.AwayFromZero),
                Get("assignedto"),
                Get("state"),
                closed));
        }

        if (errors.Count > 0)
            throw new AppException($"Encontrei {errors.Count} linha(s) com problema no CSV. Corrija o arquivo e importe de novo.", details: errors);

        if (rows.Count == 0)
            throw new AppException("O CSV não tem nenhuma linha de dados.");

        return rows;
    }

    /// <summary>Lê como UTF-8 (com ou sem BOM). Se o arquivo não for UTF-8 válido, usa Latin-1, comum em exports do Excel.</summary>
    private static string ReadText(Stream stream)
    {
        using var ms = new MemoryStream();
        stream.CopyTo(ms);
        var bytes = ms.ToArray();

        var offset = bytes.Length >= 3 && bytes[0] == 0xEF && bytes[1] == 0xBB && bytes[2] == 0xBF ? 3 : 0;
        try
        {
            return new UTF8Encoding(false, throwOnInvalidBytes: true).GetString(bytes, offset, bytes.Length - offset);
        }
        catch (DecoderFallbackException)
        {
            return Encoding.Latin1.GetString(bytes);
        }
    }

    private static string NormalizeHeader(string header) =>
        new string(header.Where(char.IsLetterOrDigit).ToArray()).ToLowerInvariant();

    internal static bool TryParseHours(string raw, out decimal? hours)
    {
        hours = null;
        if (string.IsNullOrWhiteSpace(raw)) return true;

        var normalized = raw.Trim();
        // Aceita "2,5" (padrão brasileiro) além de "2.5".
        if (normalized.Contains(',') && !normalized.Contains('.'))
            normalized = normalized.Replace(',', '.');

        if (decimal.TryParse(normalized, NumberStyles.Number, CultureInfo.InvariantCulture, out var value))
        {
            hours = value;
            return true;
        }
        return false;
    }

    internal static bool TryParseDate(string raw, out DateTime? date)
    {
        date = null;
        if (string.IsNullOrWhiteSpace(raw)) return true;

        if (DateTime.TryParseExact(raw.Trim(), DateFormats, CultureInfo.InvariantCulture, DateTimeStyles.AllowWhiteSpaces, out var exact))
        {
            date = DateTime.SpecifyKind(exact, DateTimeKind.Unspecified);
            return true;
        }

        if (DateTime.TryParse(raw.Trim(), CultureInfo.GetCultureInfo("pt-BR"), DateTimeStyles.AllowWhiteSpaces, out var loose))
        {
            date = DateTime.SpecifyKind(loose, DateTimeKind.Unspecified);
            return true;
        }

        return false;
    }
}
