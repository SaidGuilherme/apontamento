using System.Text.Json.Serialization;
using ApontamentoHoras.Api.Data;
using ApontamentoHoras.Api.Endpoints;
using ApontamentoHoras.Api.Services;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

var connectionString = builder.Configuration.GetConnectionString("Default")
                       ?? throw new InvalidOperationException("Defina ConnectionStrings:Default.");

builder.Services.AddDbContext<AppDbContext>(o => o.UseNpgsql(connectionString));

// As chaves que criptografam a chave de API do Redmine ficam num volume, para sobreviver a rebuilds.
var keysPath = builder.Configuration["DataProtection:KeysPath"] ?? Path.Combine(AppContext.BaseDirectory, "keys");
builder.Services.AddDataProtection()
    .SetApplicationName("apontamento-horas")
    .PersistKeysToFileSystem(new DirectoryInfo(keysPath));

builder.Services.ConfigureHttpJsonOptions(o =>
    o.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));

builder.Services.AddHttpClient(RedmineClient.HttpClientName, c => c.Timeout = TimeSpan.FromSeconds(30));
builder.Services.AddHttpClient(RedmineClient.InsecureHttpClientName, c => c.Timeout = TimeSpan.FromSeconds(30))
    .ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler
    {
        // Só usado quando "Ignorar erros de certificado" está ligado (Redmine interno com certificado próprio).
        ServerCertificateCustomValidationCallback = HttpClientHandler.DangerousAcceptAnyServerCertificateValidator,
    });

builder.Services.AddSingleton<CsvImportService>();
builder.Services.AddSingleton<XlsxExportService>();
builder.Services.AddScoped<SettingsService>();
builder.Services.AddScoped<RedmineClient>();
builder.Services.AddScoped<ImportService>();

builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<AppExceptionHandler>();

// Para rodar o frontend com "npm run dev" fora do Docker.
builder.Services.AddCors(o => o.AddDefaultPolicy(p =>
    p.WithOrigins("http://localhost:5173").AllowAnyHeader().AllowAnyMethod().WithExposedHeaders("Content-Disposition")));

var app = builder.Build();

app.UseExceptionHandler();
app.UseCors();

await DatabaseInitializer.InitializeAsync(app.Services, app.Logger);

app.MapApi();

app.Run();
