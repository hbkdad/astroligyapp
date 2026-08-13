config {
  call_module_type = "local"
  force            = false
}

rule "terraform_deprecated_interpolation" { enabled = true }
rule "terraform_documented_outputs" { enabled = false }
rule "terraform_documented_variables" { enabled = false }
rule "terraform_empty_list_equality" { enabled = true }
rule "terraform_module_pinned_source" { enabled = true }
rule "terraform_module_version" { enabled = true }
rule "terraform_naming_convention" { enabled = true }
rule "terraform_required_providers" { enabled = true }
rule "terraform_required_version" { enabled = true }
rule "terraform_typed_variables" { enabled = true }
rule "terraform_unused_declarations" { enabled = true }
rule "terraform_unused_required_providers" { enabled = true }
rule "terraform_workspace_remote" { enabled = true }
