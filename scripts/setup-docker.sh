#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_DIR=$(CDPATH= cd -- "${SCRIPT_DIR}/.." && pwd)
EXAMPLE_FILE="${PROJECT_DIR}/.env.docker.example"
TARGET_FILE="${PROJECT_DIR}/.env"
LOCAL_FILE="${PROJECT_DIR}/.env.local"
TEMP_FILE=""

env_value() {
  awk -F= -v wanted="$1" '
    $1 == wanted {
      sub(/^[^=]*=/, "")
      sub(/\r$/, "")
      value = $0
      found = 1
    }
    END { if (found) print value }
  ' "$2"
}

env_occurrences() {
  awk -F= -v wanted="$1" '
    $1 == wanted { count += 1 }
    END { print count + 0 }
  ' "$2"
}

normalize_secret() {
  normalized_value=$(printf '%s' "$1" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')
  case "${normalized_value}" in
    \"*\")
      normalized_value=${normalized_value#\"}
      normalized_value=${normalized_value%\"}
      ;;
    \'*\')
      normalized_value=${normalized_value#\'}
      normalized_value=${normalized_value%\'}
      ;;
  esac
  printf '%s' "${normalized_value}"
}

validate_existing_env() {
  for required_key in POSTGRES_PASSWORD N8N_ENCRYPTION_KEY N8N_RUNNERS_AUTH_TOKEN; do
    required_count=$(env_occurrences "${required_key}" "${TARGET_FILE}")
    if [ "${required_count}" -ne 1 ]; then
      printf '%s\n' "ERROR: ${required_key} harus muncul tepat satu kali pada .env." >&2
      exit 1
    fi
    required_value=$(normalize_secret "$(env_value "${required_key}" "${TARGET_FILE}")")
    placeholder_probe=$(printf '%s' "${required_value}" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')
    case "${required_value}" in
      "")
        printf '%s\n' "ERROR: ${required_key} pada .env masih kosong atau berupa placeholder." >&2
        exit 1
        ;;
    esac
    case "${placeholder_probe}" in
      ""|__GENERATE_*__)
        printf '%s\n' "ERROR: ${required_key} pada .env masih kosong atau berupa placeholder." >&2
        exit 1
        ;;
    esac
    if [ "${#required_value}" -lt 32 ]; then
      printf '%s\n' "ERROR: ${required_key} pada .env minimal 32 karakter." >&2
      exit 1
    fi
  done
  chmod 600 "${TARGET_FILE}" 2>/dev/null || true
}

if [ -f "${TARGET_FILE}" ]; then
  validate_existing_env
  printf '%s\n' "File .env sudah ada; secret wajib lolos pemeriksaan. Tidak ada file yang ditimpa."
  exit 0
fi

secret_hex() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex "$1"
  else
    od -An -N "$1" -tx1 /dev/urandom | tr -d ' \n'
  fi
}

replace_value() {
  key=$1
  value=$2
  awk -v key="${key}" -v value="${value}" '
    index($0, key "=") == 1 { print key "=" value; next }
    { print }
  ' "${TEMP_FILE}" > "${TEMP_FILE}.next"
  mv "${TEMP_FILE}.next" "${TEMP_FILE}"
}

umask 077
TEMP_FILE=$(mktemp "${PROJECT_DIR}/.env.docker.tmp.XXXXXX")
trap 'rm -f "${TEMP_FILE}" "${TEMP_FILE}.next"' EXIT HUP INT TERM
cp "${EXAMPLE_FILE}" "${TEMP_FILE}"

replace_value "POSTGRES_PASSWORD" "$(secret_hex 24)"
replace_value "N8N_ENCRYPTION_KEY" "$(secret_hex 32)"
replace_value "N8N_RUNNERS_AUTH_TOKEN" "$(secret_hex 32)"

if [ -f "${LOCAL_FILE}" ]; then
  carriage_return=$(printf '\r')
  while IFS='=' read -r key value || [ -n "${key}${value}" ]; do
    key=${key%"${carriage_return}"}
    value=${value%"${carriage_return}"}
    case "${key}" in
      VITE_N8N_WEBHOOK_URL)
        ;;
      VITE_SUMAI_COMPANY_ID|VITE_FIREBASE_API_KEY|VITE_FIREBASE_AUTH_DOMAIN|VITE_FIREBASE_PROJECT_ID|VITE_FIREBASE_STORAGE_BUCKET|VITE_FIREBASE_MESSAGING_SENDER_ID|VITE_FIREBASE_APP_ID|VITE_FIREBASE_MEASUREMENT_ID)
        replace_value "${key}" "${value}"
        ;;
    esac
  done < "${LOCAL_FILE}"
fi

mv "${TEMP_FILE}" "${TARGET_FILE}"
chmod 600 "${TARGET_FILE}" 2>/dev/null || true
trap - EXIT HUP INT TERM

printf '%s\n' "File .env berhasil dibuat."
printf '%s\n' "Periksa URL dan konfigurasi Firebase, lalu jalankan: docker compose config --quiet"
printf '%s\n' "Jika valid, jalankan: docker compose up -d --build"
