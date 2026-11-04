using Microsoft.AspNetCore.Diagnostics;

namespace ApontamentoHoras.Api.Services;

/// <summary>Erro esperado, com mensagem pronta para mostrar ao usuário.</summary>
public class AppException(string message, int statusCode = StatusCodes.Status400BadRequest, IReadOnlyList<string>? details = null)
    : Exception(message)
{
    public int StatusCode { get; } = statusCode;
    public IReadOnlyList<string> Details { get; } = details ?? [];
}

/// <summary>Transforma exceções em respostas JSON no formato { title, status, details }.</summary>
public class AppExceptionHandler(ILogger<AppExceptionHandler> logger) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext httpContext, Exception exception, CancellationToken cancellationToken)
    {
        int status;
        string title;
        IReadOnlyList<string> details = [];

        switch (exception)
        {
            case AppException app:
                status = app.StatusCode;
                title = app.Message;
                details = app.Details;
                break;
            case BadHttpRequestException bad:
                status = StatusCodes.Status400BadRequest;
                title = "Requisição inválida: " + bad.Message;
                break;
            default:
                logger.LogError(exception, "Erro não tratado");
                status = StatusCodes.Status500InternalServerError;
                title = "Erro inesperado no servidor. Veja os logs da API para mais detalhes.";
                break;
        }

        httpContext.Response.StatusCode = status;
        await httpContext.Response.WriteAsJsonAsync(new { title, status, details }, cancellationToken);
        return true;
    }
}
