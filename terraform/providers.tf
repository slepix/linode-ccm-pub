terraform {
  required_version = ">= 1.5.0"

  required_providers {
    linode = {
      source  = "linode/linode"
    }
    random = {
      source  = "hashicorp/random"
    }
    local = {
      source  = "hashicorp/local"
    }
    null = {
      source  = "hashicorp/null"
    }
  }
}

provider "linode" {
  token = var.linode_token
}
