import { Command } from "commander";
import { buildCompanyUrl, buildPostUrl, buildProfileUrl } from "../core/linkedin.js";

export function registerUrlCommands(program: Command): void {
  const url = program.command("url").description("Build LinkedIn canonical URLs");

  url
    .command("profile")
    .description("Build profile URL from a vanity name")
    .requiredOption("--id <vanityName>", "LinkedIn profile vanity name")
    .action((opts: { id: string }) => {
      console.log(buildProfileUrl(opts.id));
    });

  url
    .command("post")
    .description("Build post URL from a LinkedIn activity id")
    .requiredOption("--activity <id>", "LinkedIn activity id")
    .action((opts: { activity: string }) => {
      console.log(buildPostUrl(opts.activity));
    });

  url
    .command("company")
    .description("Build company URL from a slug")
    .requiredOption("--id <slug>", "LinkedIn company slug")
    .action((opts: { id: string }) => {
      console.log(buildCompanyUrl(opts.id));
    });
}
