terraform {
  backend "gcs" {
    bucket = "vi-agent-tfstate"
    prefix = "staging"
  }
}
