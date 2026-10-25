// The product's own name — shown in the app shell, page titles, emails and
// notification footers. Each team's own name (Team.name) is shown alongside
// it inside the app. Change it here; nothing else hard-codes it.
export const PRODUCT_NAME = "TeamHQ";
export const PRODUCT_TAGLINE = "Operations, tasks and people in one workspace for your team.";

// The team that owns this deployment's env-configured Discord bot, Discord
// webhooks and Slack app (the original Charlie setup). Only this team's
// events go to those channels; every other team uses the Discord webhook it
// saves in its own Settings, or gets no notifications.
export const HOME_TEAM_SLUG = process.env.HOME_TEAM_SLUG || "charlie";
