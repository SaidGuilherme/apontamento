using ApontamentoHoras.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace ApontamentoHoras.Api.Data;

public static class DatabaseInitializer
{
    /// <summary>
    /// Cria o banco e as tabelas a partir do modelo do EF Core e garante a linha de configurações.
    /// Tenta de novo por alguns segundos enquanto o Postgres termina de subir.
    /// </summary>
    public static async Task InitializeAsync(IServiceProvider services, ILogger logger)
    {
        const int maxAttempts = 15;
        for (var attempt = 1; ; attempt++)
        {
            try
            {
                await using var scope = services.CreateAsyncScope();
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                await db.Database.EnsureCreatedAsync();

                if (!await db.Settings.AnyAsync(x => x.Id == AppSettings.SingletonId))
                {
                    db.Settings.Add(new AppSettings());
                    await db.SaveChangesAsync();
                }

                logger.LogInformation("Banco de dados pronto.");
                return;
            }
            catch (Exception ex) when (attempt < maxAttempts)
            {
                logger.LogWarning("Banco ainda indisponível (tentativa {Attempt}/{Max}): {Message}", attempt, maxAttempts, ex.Message);
                await Task.Delay(TimeSpan.FromSeconds(2));
            }
        }
    }
}
