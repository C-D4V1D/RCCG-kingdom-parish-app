# tgrelay-off-20261022: switch for the old Telegram-to-WhatsApp relay (UNTESTED on the box)
Separate from `instinct-alerts-20261022` on purpose. Do NOT run `off` until Instinct confirms the email forward works.
`relay_switch.py off` writes `/workspace/state/tg-relay-off`; `on` removes it. The operator wires the relay's send step to
`relay_switch.relay_enabled()` (skip when False). The relay's code is not in this repo, so that one-line hook is the operator's.
