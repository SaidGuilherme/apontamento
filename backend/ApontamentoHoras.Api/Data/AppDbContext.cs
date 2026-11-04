using ApontamentoHoras.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace ApontamentoHoras.Api.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<AppSettings> Settings => Set<AppSettings>();
    public DbSet<TaskType> TaskTypes => Set<TaskType>();
    public DbSet<Import> Imports => Set<Import>();
    public DbSet<ImportItem> ImportItems => Set<ImportItem>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<AppSettings>(e =>
        {
            e.ToTable("app_settings");
            e.Property(x => x.Id).ValueGeneratedNever();
            e.Property(x => x.RedmineUrl).HasMaxLength(500);
            e.Property(x => x.DefaultProjectName).HasMaxLength(200).IsRequired();
            e.Property(x => x.DefaultRedmineProjectName).HasMaxLength(300);
            e.Property(x => x.DefaultIssueSubject).HasMaxLength(500);
            e.Property(x => x.DefaultActivityName).HasMaxLength(200);
        });

        modelBuilder.Entity<TaskType>(e =>
        {
            e.ToTable("task_types");
            e.Property(x => x.Name).HasMaxLength(100).IsRequired();
            e.HasIndex(x => x.Name).IsUnique();
        });

        modelBuilder.Entity<Import>(e =>
        {
            e.ToTable("imports");
            e.Property(x => x.FileName).HasMaxLength(300).IsRequired();
            e.Property(x => x.IssueSubject).HasMaxLength(500);
            e.HasMany(x => x.Items)
                .WithOne(x => x.Import)
                .HasForeignKey(x => x.ImportId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<ImportItem>(e =>
        {
            e.ToTable("import_items");
            e.Property(x => x.Project).HasMaxLength(200);
            e.Property(x => x.WorkItemType).HasMaxLength(100);
            e.Property(x => x.TaskType).HasMaxLength(100);
            e.Property(x => x.Title).HasMaxLength(1000);
            e.Property(x => x.AssignedTo).HasMaxLength(300);
            e.Property(x => x.State).HasMaxLength(100);
            e.Property(x => x.CompletedWork).HasPrecision(8, 2);
            // A Closed Date do Azure DevOps vem sem fuso; guardamos como horário local.
            e.Property(x => x.ClosedDate).HasColumnType("timestamp without time zone");
            e.Property(x => x.RedmineStatus).HasConversion<string>().HasMaxLength(20);
            e.Property(x => x.RedmineError).HasMaxLength(2000);
            e.HasIndex(x => x.WorkItemId);
        });
    }
}
