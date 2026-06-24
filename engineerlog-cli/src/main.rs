use anyhow::{anyhow, bail, Context, Result};
use clap::{Parser, Subcommand, ValueEnum};
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;

#[derive(Parser)]
#[command(name = "elog", version, about = "EngineerLog command line client")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Pair this machine with EngineerLog using a token from the web profile.
    Auth {
        #[arg(long)]
        base_url: String,
        #[arg(long)]
        token: String,
        /// PEM CA certificate to trust for this EngineerLog server.
        #[arg(long)]
        ca_cert: Option<PathBuf>,
        /// Enable strict TLS certificate verification. By default this CLI accepts the current internal certificate setup.
        #[arg(long)]
        tls_verify: bool,
    },
    /// Show the linked account.
    Whoami,
    /// Add an activity log.
    Add {
        #[arg(long)]
        act: String,
        #[arg(long)]
        topic: String,
        #[arg(long)]
        dur: String,
        #[arg(long)]
        date: Option<String>,
        #[arg(long, default_value = "completed")]
        status: String,
        #[arg(long)]
        note: Option<String>,
        #[arg(long)]
        start: Option<String>,
        #[arg(long)]
        end: Option<String>,
        #[arg(long)]
        ticket: Option<String>,
        #[arg(long)]
        title: Option<String>,
        #[arg(long)]
        customer: Option<String>,
        #[arg(long)]
        pr: Option<String>,
        #[arg(long)]
        lead: Option<String>,
        #[arg(long)]
        value: Option<f64>,
        #[arg(long)]
        nps: Option<i32>,
    },
    /// Show recent activity logs.
    List {
        #[arg(long, default_value_t = 5)]
        limit: u8,
        #[arg(long)]
        from: Option<String>,
        #[arg(long)]
        to: Option<String>,
        #[arg(long)]
        act: Option<String>,
        #[arg(long)]
        status: Option<String>,
        #[arg(long, default_value = "manual")]
        source: String,
        #[arg(long)]
        search: Option<String>,
    },
    /// Show available manual categories.
    Categories,
    /// Print shell completion script.
    Completions {
        #[arg(value_enum)]
        shell: CompletionShell,
    },
    #[command(name = "_complete-act", hide = true)]
    CompleteAct,
}

#[derive(Clone, Debug, ValueEnum)]
enum CompletionShell {
    Bash,
    Zsh,
    Fish,
}

#[derive(Debug, Serialize, Deserialize)]
struct Config {
    base_url: String,
    api_token: String,
    #[serde(default)]
    ca_cert_path: Option<String>,
    #[serde(default)]
    insecure_skip_tls_verify: bool,
    user: LinkedUser,
}

#[derive(Debug, Serialize, Deserialize)]
struct LinkedUser {
    email: String,
    name: String,
    role: String,
    team: Option<String>,
}

#[derive(Debug, Deserialize)]
struct AuthResponse {
    #[serde(rename = "cliToken")]
    cli_token: String,
    user: LinkedUser,
}

fn main() -> Result<()> {
    let cli = Cli::parse();
    match cli.command {
        Commands::Auth {
            base_url,
            token,
            ca_cert,
            tls_verify,
        } => auth(base_url, token, ca_cert, tls_verify),
        Commands::Whoami => whoami(),
        Commands::Add {
            act,
            topic,
            dur,
            date,
            status,
            note,
            start,
            end,
            ticket,
            title,
            customer,
            pr,
            lead,
            value,
            nps,
        } => add_activity(AddInput {
            act,
            topic,
            dur,
            date,
            status,
            note,
            start,
            end,
            ticket,
            title,
            customer,
            pr,
            lead,
            value,
            nps,
        }),
        Commands::List {
            limit,
            from,
            to,
            act,
            status,
            source,
            search,
        } => list_activities(limit, from, to, act, status, source, search),
        Commands::Categories => categories(),
        Commands::Completions { shell } => completions(shell),
        Commands::CompleteAct => complete_act(),
    }
}

fn config_path() -> Result<PathBuf> {
    let dir = dirs::home_dir()
        .ok_or_else(|| anyhow!("Cannot resolve home directory"))?
        .join(".engineerlog");
    fs::create_dir_all(&dir)?;
    Ok(dir.join("config.json"))
}

fn category_cache_path() -> Result<PathBuf> {
    let dir = dirs::home_dir()
        .ok_or_else(|| anyhow!("Cannot resolve home directory"))?
        .join(".engineerlog");
    fs::create_dir_all(&dir)?;
    Ok(dir.join("categories.json"))
}

fn load_config() -> Result<Config> {
    let path = config_path()?;
    let raw = fs::read_to_string(&path).with_context(|| {
        format!(
            "Belum login. Jalankan: elog auth --base-url <url> --token <token>. Config: {}",
            path.display()
        )
    })?;
    Ok(serde_json::from_str(&raw)?)
}

fn save_config(config: &Config) -> Result<()> {
    let path = config_path()?;
    let raw = serde_json::to_string_pretty(config)?;
    fs::write(&path, raw)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&path, fs::Permissions::from_mode(0o600))?;
    }
    Ok(())
}

fn normalize_base_url(raw: &str) -> Result<String> {
    let value = raw.trim().trim_end_matches('/').to_string();
    let is_local = value.starts_with("http://localhost")
        || value.starts_with("http://127.0.0.1")
        || value.starts_with("http://[::1]");
    if !value.starts_with("https://") && !is_local {
        bail!("Base URL harus HTTPS. HTTP hanya diizinkan untuk localhost.");
    }
    Ok(value)
}

fn build_client(ca_cert_path: Option<&str>, insecure_skip_tls_verify: bool) -> Result<Client> {
    let mut builder = Client::builder();
    if let Some(path) = ca_cert_path {
        let cert_bytes =
            fs::read(path).with_context(|| format!("Gagal membaca CA cert: {}", path))?;
        let cert = reqwest::Certificate::from_pem(&cert_bytes)
            .with_context(|| format!("CA cert bukan PEM valid: {}", path))?;
        builder = builder.add_root_certificate(cert);
    }
    if insecure_skip_tls_verify {
        builder = builder.danger_accept_invalid_certs(true);
    }
    Ok(builder.build()?)
}

fn auth(base_url: String, token: String, ca_cert: Option<PathBuf>, tls_verify: bool) -> Result<()> {
    let base_url = normalize_base_url(&base_url)?;
    let insecure_skip_tls_verify = !tls_verify && ca_cert.is_none();

    let ca_cert_path = ca_cert.map(|path| path.to_string_lossy().to_string());
    let client = build_client(ca_cert_path.as_deref(), insecure_skip_tls_verify)?;
    let url = format!("{}/api/cli/auth", base_url);
    let response = client
        .post(url)
        .json(&json!({
            "token": token,
        }))
        .send()?;

    let status = response.status();
    let text = response.text()?;
    if !status.is_success() {
        bail!("Auth gagal: {}", extract_error(&text));
    }

    let auth_response: AuthResponse = serde_json::from_str(&text)?;

    render_kv_panel(
        "EngineerLog CLI linked",
        &[
            (
                "User",
                format!("{} <{}>", auth_response.user.name, auth_response.user.email),
            ),
            ("Config", config_path()?.display().to_string()),
            (
                "TLS",
                if insecure_skip_tls_verify {
                    "verification disabled".to_string()
                } else {
                    "verification enabled".to_string()
                },
            ),
        ],
    );

    save_config(&Config {
        base_url,
        api_token: auth_response.cli_token,
        ca_cert_path,
        insecure_skip_tls_verify,
        user: auth_response.user,
    })?;
    Ok(())
}

fn request_json(
    config: &Config,
    method: &str,
    path_and_query: &str,
    body: Option<String>,
) -> Result<Value> {
    let client = build_client(
        config.ca_cert_path.as_deref(),
        config.insecure_skip_tls_verify,
    )?;
    let url = format!("{}{}", config.base_url, path_and_query);
    let body_text = body.unwrap_or_default();

    let builder = match method {
        "GET" => client.get(url),
        "POST" => client.post(url),
        _ => bail!("Unsupported method: {}", method),
    }
    .bearer_auth(&config.api_token);

    let response = if body_text.is_empty() {
        builder.send()?
    } else {
        builder
            .header("content-type", "application/json")
            .body(body_text)
            .send()?
    };

    let status = response.status();
    let text = response.text()?;
    if !status.is_success() {
        bail!("{}", extract_error(&text));
    }
    Ok(serde_json::from_str(&text)?)
}

fn send_json(
    config: &Config,
    method: &str,
    path_and_query: &str,
    body: Option<Value>,
) -> Result<Value> {
    let body_text = match body {
        Some(value) => Some(serde_json::to_string(&value)?),
        None => None,
    };
    request_json(config, method, path_and_query, body_text)
}

fn extract_error(text: &str) -> String {
    serde_json::from_str::<Value>(text)
        .ok()
        .and_then(|v| v.get("error").and_then(|e| e.as_str()).map(str::to_string))
        .unwrap_or_else(|| text.to_string())
}

fn whoami() -> Result<()> {
    let config = load_config()?;
    let response = send_json(&config, "GET", "/api/cli/me", None)?;
    let user = response.get("user").unwrap_or(&Value::Null);
    render_kv_panel(
        "EngineerLog Account",
        &[
            ("Name", value_str(user, "name")),
            ("Email", value_str(user, "email")),
            ("Role", value_str(user, "role")),
            ("Team", value_str(user, "team")),
        ],
    );
    Ok(())
}

struct AddInput {
    act: String,
    topic: String,
    dur: String,
    date: Option<String>,
    status: String,
    note: Option<String>,
    start: Option<String>,
    end: Option<String>,
    ticket: Option<String>,
    title: Option<String>,
    customer: Option<String>,
    pr: Option<String>,
    lead: Option<String>,
    value: Option<f64>,
    nps: Option<i32>,
}

fn add_activity(input: AddInput) -> Result<()> {
    let config = load_config()?;
    ensure_valid_act(&config, &input.act)?;
    let dur = parse_duration_minutes(&input.dur)?;
    let body = json!({
        "actKey": input.act,
        "topic": input.topic,
        "dur": dur,
        "date": input.date,
        "status": input.status,
        "note": input.note,
        "startTime": input.start,
        "endTime": input.end,
        "ticketId": input.ticket,
        "ticketTitle": input.title,
        "customerName": input.customer,
        "prName": input.pr,
        "leadId": input.lead,
        "prospectValue": input.value,
        "nps": input.nps,
    });

    let activity = send_json(&config, "POST", "/api/cli/activities", Some(body))?;
    render_kv_panel(
        "Activity saved",
        &[
            ("ID", value_str(&activity, "id")),
            ("Date", value_str(&activity, "date")),
            ("Activity", value_str(&activity, "actKey")),
            (
                "Duration",
                format_minutes(activity["dur"].as_f64().unwrap_or(0.0)),
            ),
            ("Status", value_str(&activity, "status")),
            ("Topic", value_str(&activity, "topic")),
        ],
    );
    Ok(())
}

fn list_activities(
    limit: u8,
    from: Option<String>,
    to: Option<String>,
    act: Option<String>,
    status: Option<String>,
    source: String,
    search: Option<String>,
) -> Result<()> {
    let config = load_config()?;
    let mut params = vec![format!("limit={}", limit), format!("source={}", source)];
    push_query(&mut params, "dateFrom", from);
    push_query(&mut params, "dateTo", to);
    push_query(&mut params, "actKey", act);
    push_query(&mut params, "status", status);
    push_query(&mut params, "search", search);
    let path = format!("/api/cli/activities?{}", params.join("&"));
    let response = send_json(&config, "GET", &path, None)?;
    let items = response["items"].as_array().cloned().unwrap_or_default();

    if items.is_empty() {
        render_box("Recent Activities", &["No activities found.".to_string()]);
        return Ok(());
    }

    let rows = items
        .iter()
        .map(|item| {
            vec![
                value_str(item, "date"),
                value_str(item, "actKey"),
                format_minutes(item["dur"].as_f64().unwrap_or(0.0)),
                value_str(item, "status"),
                value_str(item, "topic"),
            ]
        })
        .collect::<Vec<_>>();
    render_table(
        "Recent Activities",
        &["Date", "Activity", "Dur", "Status", "Topic"],
        &rows,
        &[12, 18, 8, 12, 42],
    );
    Ok(())
}

fn categories() -> Result<()> {
    let config = load_config()?;
    let items = fetch_categories(&config)?;

    if items.is_empty() {
        render_box(
            "Available Categories",
            &["No categories found.".to_string()],
        );
        return Ok(());
    }

    let rows = items
        .iter()
        .map(|item| {
            vec![
                value_str(item, "actKey"),
                value_str(item, "label"),
                value_str(item, "team"),
                value_str(item, "desc"),
            ]
        })
        .collect::<Vec<_>>();
    render_table(
        "Available Categories",
        &["Act Key", "Label", "Team", "Description"],
        &rows,
        &[18, 24, 10, 44],
    );
    Ok(())
}

fn fetch_categories(config: &Config) -> Result<Vec<Value>> {
    let response = send_json(config, "GET", "/api/cli/categories", None)?;
    let items = response["items"].as_array().cloned().unwrap_or_default();
    save_category_cache(&items)?;
    Ok(items)
}

fn save_category_cache(items: &[Value]) -> Result<()> {
    fs::write(category_cache_path()?, serde_json::to_string_pretty(items)?)?;
    Ok(())
}

fn load_category_cache() -> Vec<Value> {
    category_cache_path()
        .ok()
        .and_then(|path| fs::read_to_string(path).ok())
        .and_then(|raw| serde_json::from_str::<Vec<Value>>(&raw).ok())
        .unwrap_or_default()
}

fn ensure_valid_act(config: &Config, act: &str) -> Result<()> {
    let items = fetch_categories(config)?;
    if items.iter().any(|item| value_str(item, "actKey") == act) {
        return Ok(());
    }

    let needle = act.to_lowercase();
    let mut suggestions = items
        .iter()
        .filter(|item| {
            let key = value_str(item, "actKey").to_lowercase();
            let label = value_str(item, "label").to_lowercase();
            key.contains(&needle)
                || needle.contains(&key)
                || label.contains(&needle)
                || key.starts_with(&needle)
        })
        .cloned()
        .collect::<Vec<_>>();

    if suggestions.is_empty() {
        suggestions = items.iter().take(8).cloned().collect();
    }

    let rows = suggestions
        .iter()
        .map(|item| {
            vec![
                value_str(item, "actKey"),
                value_str(item, "label"),
                value_str(item, "team"),
            ]
        })
        .collect::<Vec<_>>();

    render_table(
        "Category Suggestions",
        &["Act Key", "Label", "Team"],
        &rows,
        &[20, 28, 12],
    );
    bail!(
        "Kategori activity tidak dikenal: {}. Pilih salah satu act key di atas.",
        act
    )
}

fn complete_act() -> Result<()> {
    for item in load_category_cache() {
        let act_key = value_str(&item, "actKey");
        if act_key != "-" {
            println!("{}", act_key);
        }
    }
    Ok(())
}

fn completions(shell: CompletionShell) -> Result<()> {
    match shell {
        CompletionShell::Bash => print!("{}", BASH_COMPLETION),
        CompletionShell::Zsh => print!("{}", ZSH_COMPLETION),
        CompletionShell::Fish => print!("{}", FISH_COMPLETION),
    }
    Ok(())
}

fn value_str(value: &Value, key: &str) -> String {
    value[key]
        .as_str()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("-")
        .to_string()
}

fn text_width(value: &str) -> usize {
    value.chars().count()
}

fn fit_cell(value: &str, width: usize) -> String {
    let clipped = truncate(value, width);
    let padding = width.saturating_sub(text_width(&clipped));
    format!("{}{}", clipped, " ".repeat(padding))
}

fn horizontal(left: &str, middle: &str, right: &str, widths: &[usize]) -> String {
    let mut out = String::from(left);
    for (index, width) in widths.iter().enumerate() {
        out.push_str(&"─".repeat(width + 2));
        out.push_str(if index + 1 == widths.len() {
            right
        } else {
            middle
        });
    }
    out
}

fn render_box(title: &str, lines: &[String]) {
    let content_width = lines
        .iter()
        .map(|line| text_width(line))
        .chain([text_width(title)])
        .max()
        .unwrap_or(24)
        .max(24);

    println!("╭{}╮", "─".repeat(content_width + 2));
    println!(
        "│ {}{} │",
        title,
        " ".repeat(content_width.saturating_sub(text_width(title)))
    );
    println!("├{}┤", "─".repeat(content_width + 2));
    for line in lines {
        println!(
            "│ {}{} │",
            line,
            " ".repeat(content_width.saturating_sub(text_width(line)))
        );
    }
    println!("╰{}╯", "─".repeat(content_width + 2));
}

fn render_kv_panel(title: &str, rows: &[(&str, String)]) {
    let key_width = rows
        .iter()
        .map(|(key, _)| text_width(key))
        .max()
        .unwrap_or(0)
        .max(8);
    let value_width = rows
        .iter()
        .map(|(_, value)| text_width(value))
        .max()
        .unwrap_or(0)
        .max(24);
    let content_width = key_width + value_width + 3;

    println!("╭{}╮", "─".repeat(content_width + 2));
    println!(
        "│ {}{} │",
        title,
        " ".repeat(content_width.saturating_sub(text_width(title)))
    );
    println!("├{}┤", "─".repeat(content_width + 2));
    for (key, value) in rows {
        println!(
            "│ {} │ {}{} │",
            fit_cell(key, key_width),
            value,
            " ".repeat(value_width.saturating_sub(text_width(value)))
        );
    }
    println!("╰{}╯", "─".repeat(content_width + 2));
}

fn render_table(title: &str, headers: &[&str], rows: &[Vec<String>], widths: &[usize]) {
    render_box(title, &[format!("{} item(s)", rows.len())]);
    println!("{}", horizontal("┌", "┬", "┐", widths));
    print!("│");
    for (header, width) in headers.iter().zip(widths.iter()) {
        print!(" {} │", fit_cell(header, *width));
    }
    println!();
    println!("{}", horizontal("├", "┼", "┤", widths));
    for row in rows {
        print!("│");
        for (cell, width) in row.iter().zip(widths.iter()) {
            print!(" {} │", fit_cell(cell, *width));
        }
        println!();
    }
    println!("{}", horizontal("└", "┴", "┘", widths));
}
fn push_query(params: &mut Vec<String>, key: &str, value: Option<String>) {
    if let Some(value) = value {
        params.push(format!("{}={}", key, url_encode(&value)));
    }
}

fn url_encode(value: &str) -> String {
    value
        .bytes()
        .flat_map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => vec![b as char],
            _ => format!("%{:02X}", b).chars().collect(),
        })
        .collect()
}

fn parse_duration_minutes(input: &str) -> Result<i64> {
    let raw = input.to_lowercase().replace(' ', "");
    if raw.is_empty() {
        bail!("Durasi kosong");
    }

    let mut total = 0.0;
    let mut number = String::new();
    let mut used_unit = false;
    let chars: Vec<char> = raw.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        if c.is_ascii_digit() || c == '.' {
            number.push(c);
            i += 1;
            continue;
        }

        if number.is_empty() {
            bail!("Durasi tidak valid: {}", input);
        }
        let value: f64 = number.parse()?;
        number.clear();

        if raw[i..].starts_with("jam") || raw[i..].starts_with("hour") {
            total += value * 60.0;
            i += if raw[i..].starts_with("hour") { 4 } else { 3 };
        } else if c == 'j' || c == 'h' {
            total += value * 60.0;
            i += 1;
        } else if raw[i..].starts_with("menit") {
            total += value;
            i += 5;
        } else if raw[i..].starts_with("min") {
            total += value;
            i += 3;
        } else if c == 'm' {
            total += value;
            i += 1;
        } else {
            bail!("Unit durasi tidak valid: {}", input);
        }
        used_unit = true;
    }

    if !number.is_empty() {
        let value: f64 = number.parse()?;
        total += if used_unit { value } else { value };
    }

    let minutes = total.round() as i64;
    if minutes <= 0 {
        bail!("Durasi harus lebih dari 0 menit");
    }
    Ok(minutes)
}

fn format_minutes(value: f64) -> String {
    let minutes = value.round().max(0.0) as i64;
    let hours = minutes / 60;
    let mins = minutes % 60;
    match (hours, mins) {
        (0, m) => format!("{}m", m),
        (h, 0) => format!("{}j", h),
        (h, m) => format!("{}j {}m", h, m),
    }
}

fn truncate(value: &str, width: usize) -> String {
    if value.chars().count() <= width {
        return value.to_string();
    }
    let mut out = value
        .chars()
        .take(width.saturating_sub(3))
        .collect::<String>();
    out.push_str("...");
    out
}

const BASH_COMPLETION: &str = r#"_elog()
{
  local cur prev cmd
  COMPREPLY=()
  cur="${COMP_WORDS[COMP_CWORD]}"
  prev="${COMP_WORDS[COMP_CWORD-1]}"
  cmd="${COMP_WORDS[1]}"

  if [[ "$prev" == "--act" ]]; then
    COMPREPLY=( $(compgen -W "$(elog _complete-act 2>/dev/null)" -- "$cur") )
    return 0
  fi

  if [[ "$COMP_CWORD" == "1" ]]; then
    COMPREPLY=( $(compgen -W "auth whoami add list categories completions" -- "$cur") )
    return 0
  fi

  case "$cmd" in
    auth)
      COMPREPLY=( $(compgen -W "--base-url --token --ca-cert --tls-verify" -- "$cur") )
      ;;
    add)
      COMPREPLY=( $(compgen -W "--act --topic --dur --date --status --note --start --end --ticket --title --customer --pr --lead --value --nps" -- "$cur") )
      ;;
    list)
      COMPREPLY=( $(compgen -W "--limit --from --to --act --status --source --search" -- "$cur") )
      ;;
    completions)
      COMPREPLY=( $(compgen -W "bash zsh fish" -- "$cur") )
      ;;
  esac
}
complete -F _elog elog
"#;

const ZSH_COMPLETION: &str = r#"#compdef elog
_elog() {
  local -a commands opts acts
  commands=(
    'auth:pair this machine'
    'whoami:show linked account'
    'add:add activity log'
    'list:show recent activities'
    'categories:show available categories'
    'completions:print completion script'
  )

  if (( CURRENT == 2 )); then
    _describe 'command' commands
    return
  fi

  if [[ ${words[CURRENT-1]} == "--act" ]]; then
    acts=("${(@f)$(elog _complete-act 2>/dev/null)}")
    _describe 'activity category' acts
    return
  fi

  case ${words[2]} in
    auth)
      opts=(--base-url --token --ca-cert --tls-verify)
      ;;
    add)
      opts=(--act --topic --dur --date --status --note --start --end --ticket --title --customer --pr --lead --value --nps)
      ;;
    list)
      opts=(--limit --from --to --act --status --source --search)
      ;;
    completions)
      opts=(bash zsh fish)
      ;;
    *)
      opts=()
      ;;
  esac
  compadd -- $opts
}
_elog "$@"
"#;

const FISH_COMPLETION: &str = r#"complete -c elog -f
complete -c elog -n "__fish_use_subcommand" -a "auth" -d "Pair this machine"
complete -c elog -n "__fish_use_subcommand" -a "whoami" -d "Show linked account"
complete -c elog -n "__fish_use_subcommand" -a "add" -d "Add activity log"
complete -c elog -n "__fish_use_subcommand" -a "list" -d "Show recent activities"
complete -c elog -n "__fish_use_subcommand" -a "categories" -d "Show available categories"
complete -c elog -n "__fish_use_subcommand" -a "completions" -d "Print completion script"

complete -c elog -n "__fish_seen_subcommand_from auth" -l base-url -r
complete -c elog -n "__fish_seen_subcommand_from auth" -l token -r
complete -c elog -n "__fish_seen_subcommand_from auth" -l ca-cert -r
complete -c elog -n "__fish_seen_subcommand_from auth" -l tls-verify

complete -c elog -n "__fish_seen_subcommand_from add" -l act -a "(elog _complete-act 2>/dev/null)" -r
complete -c elog -n "__fish_seen_subcommand_from add" -l topic -r
complete -c elog -n "__fish_seen_subcommand_from add" -l dur -r
complete -c elog -n "__fish_seen_subcommand_from add" -l date -r
complete -c elog -n "__fish_seen_subcommand_from add" -l status -a "completed in_progress progress canceled" -r
complete -c elog -n "__fish_seen_subcommand_from add" -l note -r
complete -c elog -n "__fish_seen_subcommand_from add" -l start -r
complete -c elog -n "__fish_seen_subcommand_from add" -l end -r
complete -c elog -n "__fish_seen_subcommand_from add" -l ticket -r
complete -c elog -n "__fish_seen_subcommand_from add" -l title -r
complete -c elog -n "__fish_seen_subcommand_from add" -l customer -r
complete -c elog -n "__fish_seen_subcommand_from add" -l pr -r
complete -c elog -n "__fish_seen_subcommand_from add" -l lead -r
complete -c elog -n "__fish_seen_subcommand_from add" -l value -r
complete -c elog -n "__fish_seen_subcommand_from add" -l nps -r

complete -c elog -n "__fish_seen_subcommand_from list" -l limit -r
complete -c elog -n "__fish_seen_subcommand_from list" -l from -r
complete -c elog -n "__fish_seen_subcommand_from list" -l to -r
complete -c elog -n "__fish_seen_subcommand_from list" -l act -a "(elog _complete-act 2>/dev/null)" -r
complete -c elog -n "__fish_seen_subcommand_from list" -l status -a "completed in_progress progress canceled" -r
complete -c elog -n "__fish_seen_subcommand_from list" -l source -a "manual cli app telegram jira all" -r
complete -c elog -n "__fish_seen_subcommand_from list" -l search -r

complete -c elog -n "__fish_seen_subcommand_from completions" -a "bash zsh fish"
"#;
