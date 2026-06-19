use anyhow::{anyhow, bail, Context, Result};
use base64::{engine::general_purpose, Engine as _};
use chrono::Utc;
use clap::{Parser, Subcommand};
use rand::rngs::OsRng;
use reqwest::blocking::{Client, RequestBuilder};
use reqwest::header::{HeaderMap, HeaderValue};
use rsa::pkcs1v15::SigningKey;
use rsa::pkcs8::{DecodePrivateKey, EncodePrivateKey, EncodePublicKey, LineEnding};
use rsa::{RsaPrivateKey, RsaPublicKey};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use signature::{SignatureEncoding, Signer};
use std::fs;
use std::path::PathBuf;
use uuid::Uuid;

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
}

#[derive(Debug, Serialize, Deserialize)]
struct Config {
    base_url: String,
    key_id: String,
    private_key_pem: String,
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
    #[serde(rename = "keyId")]
    key_id: String,
    user: LinkedUser,
}

fn main() -> Result<()> {
    let cli = Cli::parse();
    match cli.command {
        Commands::Auth { base_url, token } => auth(base_url, token),
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
    }
}

fn config_path() -> Result<PathBuf> {
    let dir = dirs::home_dir()
        .ok_or_else(|| anyhow!("Cannot resolve home directory"))?
        .join(".engineerlog");
    fs::create_dir_all(&dir)?;
    Ok(dir.join("config.json"))
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

fn auth(base_url: String, token: String) -> Result<()> {
    let base_url = normalize_base_url(&base_url)?;
    let mut rng = OsRng;
    let private_key = RsaPrivateKey::new(&mut rng, 2048)?;
    let public_key = RsaPublicKey::from(&private_key);
    let private_key_pem = private_key.to_pkcs8_pem(LineEnding::LF)?.to_string();
    let public_key_pem = public_key.to_public_key_pem(LineEnding::LF)?;

    let client = Client::new();
    let url = format!("{}/api/cli/auth", base_url);
    let response = client
        .post(url)
        .json(&json!({
            "token": token,
            "publicKeyPem": public_key_pem,
        }))
        .send()?;

    let status = response.status();
    let text = response.text()?;
    if !status.is_success() {
        bail!("Auth gagal: {}", extract_error(&text));
    }

    let auth_response: AuthResponse = serde_json::from_str(&text)?;
    save_config(&Config {
        base_url,
        key_id: auth_response.key_id.clone(),
        private_key_pem,
        user: auth_response.user,
    })?;

    divider();
    println!("EngineerLog CLI linked");
    divider();
    println!("Key ID : {}", auth_response.key_id);
    println!("Config : {}", config_path()?.display());
    Ok(())
}

fn signed_request(
    config: &Config,
    method: &str,
    path_and_query: &str,
    body: Option<String>,
) -> Result<RequestBuilder> {
    let client = Client::new();
    let url = format!("{}{}", config.base_url, path_and_query);
    let timestamp = Utc::now().timestamp_millis().to_string();
    let nonce = Uuid::new_v4().to_string();
    let body_text = body.unwrap_or_default();
    let body_hash = hex::encode(Sha256::digest(body_text.as_bytes()));
    let canonical = [method, path_and_query, &timestamp, &nonce, &body_hash].join("\n");

    let private_key = RsaPrivateKey::from_pkcs8_pem(&config.private_key_pem)?;
    let signing_key = SigningKey::<Sha256>::new(private_key);
    let signature = signing_key.sign(canonical.as_bytes());
    let signature_b64 = general_purpose::STANDARD.encode(signature.to_vec());

    let mut headers = HeaderMap::new();
    headers.insert("x-elog-key-id", HeaderValue::from_str(&config.key_id)?);
    headers.insert("x-elog-timestamp", HeaderValue::from_str(&timestamp)?);
    headers.insert("x-elog-nonce", HeaderValue::from_str(&nonce)?);
    headers.insert("x-elog-signature", HeaderValue::from_str(&signature_b64)?);

    let builder = match method {
        "GET" => client.get(url),
        "POST" => client.post(url),
        _ => bail!("Unsupported method: {}", method),
    }
    .headers(headers);

    if body_text.is_empty() {
        Ok(builder)
    } else {
        Ok(builder
            .header("content-type", "application/json")
            .body(body_text))
    }
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
    let response = signed_request(config, method, path_and_query, body_text)?.send()?;
    let status = response.status();
    let text = response.text()?;
    if !status.is_success() {
        bail!("{}", extract_error(&text));
    }
    Ok(serde_json::from_str(&text)?)
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
    divider();
    println!("EngineerLog Account");
    divider();
    println!("Name  : {}", user["name"].as_str().unwrap_or("-"));
    println!("Email : {}", user["email"].as_str().unwrap_or("-"));
    println!("Role  : {}", user["role"].as_str().unwrap_or("-"));
    println!("Team  : {}", user["team"].as_str().unwrap_or("-"));
    println!("Key   : {}", config.key_id);
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
    divider();
    println!("Activity saved");
    divider();
    println!("ID     : {}", activity["id"].as_str().unwrap_or("-"));
    println!("Date   : {}", activity["date"].as_str().unwrap_or("-"));
    println!("Act    : {}", activity["actKey"].as_str().unwrap_or("-"));
    println!(
        "Dur    : {}",
        format_minutes(activity["dur"].as_f64().unwrap_or(0.0))
    );
    println!("Status : {}", activity["status"].as_str().unwrap_or("-"));
    println!("Topic  : {}", activity["topic"].as_str().unwrap_or("-"));
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

    divider();
    println!("Recent Activities");
    divider();
    if items.is_empty() {
        println!("No activities found.");
        return Ok(());
    }

    println!(
        "{:<12} | {:<16} | {:<8} | {:<11} | {}",
        "Date", "Activity", "Dur", "Status", "Topic"
    );
    println!("{}", "-".repeat(78));
    for item in items {
        println!(
            "{:<12} | {:<16} | {:<8} | {:<11} | {}",
            item["date"].as_str().unwrap_or("-"),
            truncate(item["actKey"].as_str().unwrap_or("-"), 16),
            format_minutes(item["dur"].as_f64().unwrap_or(0.0)),
            truncate(item["status"].as_str().unwrap_or("-"), 11),
            item["topic"].as_str().unwrap_or("-")
        );
    }
    Ok(())
}

fn categories() -> Result<()> {
    let config = load_config()?;
    let response = send_json(&config, "GET", "/api/cli/categories", None)?;
    let items = response["items"].as_array().cloned().unwrap_or_default();

    divider();
    println!("Available Categories");
    divider();
    println!(
        "{:<18} | {:<24} | {:<10} | {}",
        "Act Key", "Label", "Team", "Description"
    );
    println!("{}", "-".repeat(92));
    for item in items {
        println!(
            "{:<18} | {:<24} | {:<10} | {}",
            item["actKey"].as_str().unwrap_or("-"),
            truncate(item["label"].as_str().unwrap_or("-"), 24),
            item["team"].as_str().unwrap_or("-"),
            item["desc"].as_str().unwrap_or("-")
        );
    }
    Ok(())
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

fn divider() {
    println!("{}", "=".repeat(72));
}
