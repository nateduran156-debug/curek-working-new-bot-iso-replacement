import {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ActionRowBuilder,
  ButtonBuilder,
  MessageFlags,
} from "discord.js";

export const CV2_FLAG = MessageFlags.IsComponentsV2;

// builds a CV2 container card with optional header/footer/buttons
export function card(
  color: number,
  body: string,
  opts?: {
    header?: string;
    row?: ActionRowBuilder<ButtonBuilder> | ActionRowBuilder<ButtonBuilder>[];
    footer?: string;
  },
): { components: object[]; flags: number } {
  const c = new ContainerBuilder().setAccentColor(color);

  if (opts?.header) {
    c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`**${opts.header}**`));
    c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
  }

  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(body));

  if (opts?.footer) {
    c.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false));
    c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${opts.footer}`));
  }

  const rows = opts?.row ? (Array.isArray(opts.row) ? opts.row : [opts.row]) : [];
  return { components: [c, ...rows], flags: CV2_FLAG };
}
