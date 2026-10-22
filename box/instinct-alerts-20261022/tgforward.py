"""Every Telegram message David sends in the group/topics is emailed to Instinct at once. No secrets here.

forward(update, deps) -> "sent" | "skipped" | "duplicate" | "queued"
  deps: {"is_david": f(user_id)->bool, "topic_name": f(chat_id, thread_id)->str|None, "mail": f(to, subject, body)->bool}
Messages not from David are skipped. A message already forwarded (same chat and message id) is never sent twice, so a poller
restart or a re-read of the same update does not double up. If the email fails the message stays queued and is retried by the next
forward() or flush() call; the existing relay is not touched by this module.
"""
import datetime, json, os, re, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
try:
    from satalign import ALERT_TO, defang
except ImportError:                                # pragma: no cover
    _U = re.compile(r"(?i)\b(?:https?|ftp)://([^\s/?#\"'<>)\]]+)[^\s\"'<>)\]]*|\bwww\.([^\s/?#\"'<>)\]]+)[^\s\"'<>)\]]*")
    def defang(t):
        def host(m):
            tail = re.search(r"[.,;:!?]+$", m.group(0))
            return (m.group(1) or "www." + m.group(2)).rsplit("@", 1)[-1].rstrip(".,;:!?") + (tail.group(0) if tail else "")
        return _U.sub(host, str(t))
    ALERT_TO = "cdavid@mail.instinct.com"

KINDS = ("photo", "video", "voice", "audio", "document", "sticker", "video_note", "location", "contact", "poll")


def describe(msg):
    text = msg.get("text") or msg.get("caption") or ""
    media = [k for k in KINDS if k in msg]
    if media:
        text = (f"[{media[0]}] " + text).strip()
    return text or "[message without text]"


def build(msg, topic):
    chat = msg.get("chat") or {}
    when = datetime.datetime.fromtimestamp(msg.get("date") or 0, datetime.timezone.utc).isoformat(timespec="seconds")
    subject = f"[David-telegram] {topic}"
    body = "\n".join([describe(msg), "", "---", f"topic: {topic}", f"message id: {msg.get('message_id')}",
                      f"chat id: {chat.get('id')}", f"thread id: {msg.get('message_thread_id', '')}", f"sent: {when}"])
    return defang(subject), defang(body)


class Forwarder:
    def __init__(self, state_path, deps, to=None):
        self.path, self.d, self.to = state_path, deps, to or ALERT_TO

    def _load(self):
        try:
            return json.load(open(self.path))
        except (OSError, ValueError):
            return {"sent": [], "queue": {}}

    def _save(self, s):
        s["sent"] = s["sent"][-2000:]
        tmp = self.path + ".tmp"
        json.dump(s, open(tmp, "w"))
        os.replace(tmp, self.path)

    def flush(self):
        s = self._load()
        for k, item in list(s["queue"].items()):
            if self.d["mail"](self.to, item["subject"], item["body"]):
                s["queue"].pop(k)
                s["sent"].append(k)
        self._save(s)

    def forward(self, update):
        msg = update.get("message") or update.get("channel_post") or {}
        if not msg or not self.d["is_david"]((msg.get("from") or {}).get("id")):
            return "skipped"
        chat = msg.get("chat") or {}
        k = f"{chat.get('id')}:{msg.get('message_id')}"
        s = self._load()
        if k in s["sent"] or k in s["queue"]:
            return "duplicate"
        topic = self.d["topic_name"](chat.get("id"), msg.get("message_thread_id")) or (
            f"topic {msg['message_thread_id']}" if msg.get("message_thread_id") else "general")
        subject, body = build(msg, topic)
        if self.d["mail"](self.to, subject, body):
            s["sent"].append(k)
            res = "sent"
        else:
            s["queue"][k] = {"subject": subject, "body": body}
            res = "queued"
        self._save(s)
        return res
