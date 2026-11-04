using ApontamentoHoras.Api.Models;
using ClosedXML.Excel;

namespace ApontamentoHoras.Api.Services;

public class XlsxExportService
{
    private static readonly (string Header, double Width)[] Columns =
    [
        ("Projeto", 22),
        ("ID", 10),
        ("Work Item Type", 16),
        ("Tipo da tarefa", 20),
        ("Title", 70),
        ("Completed Work", 16),
        ("Assigned To", 40),
        ("State", 12),
        ("Closed Date", 20),
    ];

    public byte[] Build(IReadOnlyList<ImportItem> items)
    {
        using var workbook = new XLWorkbook();
        var ws = workbook.Worksheets.Add("Apontamento");

        for (var c = 0; c < Columns.Length; c++)
        {
            ws.Cell(1, c + 1).Value = Columns[c].Header;
            ws.Column(c + 1).Width = Columns[c].Width;
        }

        var row = 2;
        foreach (var item in items)
        {
            ws.Cell(row, 1).Value = item.Project;
            ws.Cell(row, 2).Value = item.WorkItemId;
            ws.Cell(row, 3).Value = item.WorkItemType;
            ws.Cell(row, 4).Value = item.TaskType ?? "";
            ws.Cell(row, 5).Value = item.Title;
            if (item.CompletedWork is { } hours)
                ws.Cell(row, 6).Value = (double)hours;
            ws.Cell(row, 7).Value = item.AssignedTo;
            ws.Cell(row, 8).Value = item.State;
            if (item.ClosedDate is { } closed)
                ws.Cell(row, 9).Value = closed;
            row++;
        }

        var lastRow = Math.Max(row - 1, 1);

        var headerRange = ws.Range(1, 1, 1, Columns.Length);
        headerRange.Style.Font.Bold = true;
        headerRange.Style.Fill.BackgroundColor = XLColor.FromHtml("#1F4E5F");
        headerRange.Style.Font.FontColor = XLColor.White;

        ws.Range(2, 6, lastRow, 6).Style.NumberFormat.Format = "0.00";
        ws.Range(2, 9, lastRow, 9).Style.DateFormat.Format = "dd/MM/yyyy HH:mm:ss";

        ws.Range(1, 1, lastRow, Columns.Length).SetAutoFilter();
        ws.SheetView.FreezeRows(1);

        using var ms = new MemoryStream();
        workbook.SaveAs(ms);
        return ms.ToArray();
    }
}
