FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY ApontamentoHoras.Api/ApontamentoHoras.Api.csproj ApontamentoHoras.Api/
RUN dotnet restore ApontamentoHoras.Api/ApontamentoHoras.Api.csproj
COPY ApontamentoHoras.Api/ ApontamentoHoras.Api/
RUN dotnet publish ApontamentoHoras.Api/ApontamentoHoras.Api.csproj -c Release -o /app --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /app .
ENV ASPNETCORE_HTTP_PORTS=8080
EXPOSE 8080
ENTRYPOINT ["dotnet", "ApontamentoHoras.Api.dll"]
