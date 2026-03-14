# Security Guidelines

## Before Making This Repository Public

This document outlines the security measures in place and what you need to verify before publishing this repository on GitHub.

## Protected Files (Already in .gitignore)

The following sensitive files are protected and will NOT be committed:

### Environment Variables
- `.env` - Frontend environment variables (contains Supabase keys)
- `backend/.env` - Backend environment variables (contains DB credentials, JWT secrets, API keys)
- `.env.local`, `.env.*.local` - Local environment overrides

### Python Cache Files
- `__pycache__/` - Python bytecode cache directories
- `*.py[cod]` - Compiled Python files
- `*.so` - Shared object files

### Terraform State
- `*.tfstate` - Terraform state files (may contain sensitive data)
- `*.tfstate.*` - Terraform state backups
- `*.tfvars` - Terraform variable files (except .example files)
- `.terraform/` - Terraform working directory
- `.terraform.lock.hcl` - Terraform lock file

### Credentials & Secrets
- `secrets/` - Any secrets directory
- `credentials/` - Any credentials directory
- `*.pem` - Private keys
- `*.key` - Key files
- `*.crt` - Certificate files

## Example Files (Safe to Commit)

These files provide templates without sensitive data:
- `backend/.env.example` - Template for backend environment variables
- `terraform.tfvars.example` - Template for Terraform variables

## Pre-Publication Checklist

Before making this repository public, verify:

1. **No Committed Secrets**
   - Run: `git log -p | grep -i "password\|secret\|key\|token"` to search history
   - If found, use tools like `git-filter-repo` or BFG Repo-Cleaner to remove them

2. **Environment Files**
   - Ensure `.env` and `backend/.env` are never committed
   - Verify `.env.example` files contain only placeholder values
   - Confirm all example files have clear instructions

3. **Database Credentials**
   - No database connection strings in code
   - No hardcoded passwords or API keys
   - All credentials come from environment variables

4. **API Keys**
   - No Linode API tokens in code or config
   - No JWT secrets hardcoded
   - No encryption keys in repository

5. **Terraform State**
   - Remove any `.tfstate` files from repository
   - Verify no `.tfvars` files with real values are committed
   - Consider using remote state storage (S3, Terraform Cloud, etc.)

6. **Documentation**
   - Remove any real IP addresses, domains, or server names from docs
   - Replace example credentials with obvious placeholders
   - Add clear setup instructions for new users

## Recommended Actions Before Publishing

1. **Review All Files**
   ```bash
   # Check for common secret patterns
   grep -r "password\|secret\|api_key\|token" --exclude-dir=node_modules --exclude-dir=.git
   ```

2. **Clean Git History** (if needed)
   ```bash
   # Use git-filter-repo to remove sensitive data
   git filter-repo --invert-paths --path .env
   git filter-repo --invert-paths --path backend/.env
   ```

3. **Add Security Policy**
   - Create `SECURITY.md` with vulnerability reporting instructions
   - Set up GitHub Security Advisories
   - Enable Dependabot for dependency updates

4. **Configure Repository Settings**
   - Enable branch protection for `main`
   - Require pull request reviews
   - Enable secret scanning (GitHub will scan for leaked secrets)
   - Enable dependency graph and security alerts

## Environment Variables Reference

### Frontend (.env)
- `VITE_API_BASE` - Backend API URL
- `VITE_SUPABASE_URL` - Supabase project URL (public, safe to expose)
- `VITE_SUPABASE_ANON_KEY` - Supabase anon key (public, safe to expose)

Note: Supabase public keys are designed to be exposed in frontend code. They are protected by Row Level Security (RLS) policies.

### Backend (backend/.env)
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` - Database credentials (SENSITIVE)
- `JWT_SECRET` - JWT signing key (SENSITIVE)
- `REFRESH_API_SECRET` - API endpoint protection (SENSITIVE)
- `TOKEN_ENCRYPTION_KEY` - Fernet encryption key for stored API tokens (SENSITIVE)
- `LINODE_API_BASE` - Linode API URL (public)
- `CORS_ORIGINS` - Allowed CORS origins

## Reporting Security Vulnerabilities

If you discover a security vulnerability, please email [your-security-email] instead of opening a public issue.

## Best Practices for Contributors

1. Never commit `.env` files or any file containing secrets
2. Use `.env.example` files to document required variables
3. Rotate any credentials that are accidentally committed
4. Use environment variables for all sensitive configuration
5. Keep dependencies up to date to avoid known vulnerabilities
