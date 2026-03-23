import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "./supabase.js";

/* ── helpers ── */
function generateId() {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  let id = "";
  for (let i = 0; i < 8; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

function generateTaskId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/* ── Supabase operations ── */
async function createList(id, name) {
  const { error } = await supabase.from("lists").insert({ id, name });
  return !error;
}

async function loadList(listId) {
  const { data: list, error: listErr } = await supabase
    .from("lists")
    .select("*")
    .eq("id", listId)
    .single();
  if (listErr || !list) return null;

  const { data: tasks } = await supabase
    .from("tasks")
    .select("*")
    .eq("list_id", listId)
    .order("created_at", { ascending: true });

  return { ...list, tasks: tasks || [] };
}

async function addTaskDb(task) {
  await supabase.from("tasks").insert(task);
}

async function updateTaskDb(task) {
  await supabase.from("tasks").update({
    name: task.name,
    notes: task.notes,
    completed: task.completed,
  }).eq("id", task.id);
}

async function deleteTaskDb(taskId) {
  await supabase.from("tasks").delete().eq("id", taskId);
}

/* ── Admin operations ── */
const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD || "";

async function loadAllLists() {
  const { data: lists } = await supabase
    .from("lists")
    .select("*")
    .order("created_at", { ascending: false });
  if (!lists) return [];

  const results = await Promise.all(
    lists.map(async (list) => {
      const { count: totalTasks } = await supabase
        .from("tasks")
        .select("*", { count: "exact", head: true })
        .eq("list_id", list.id);
      const { count: completedTasks } = await supabase
        .from("tasks")
        .select("*", { count: "exact", head: true })
        .eq("list_id", list.id)
        .eq("completed", true);
      return { ...list, totalTasks: totalTasks || 0, completedTasks: completedTasks || 0 };
    })
  );
  return results;
}

async function deleteListDb(listId) {
  const { error } = await supabase.from("lists").delete().eq("id", listId);
  return !error;
}

/* ── Design tokens ── */
const C = {
  bg: "#f5f5f4",
  card: "#ffffff",
  cardMuted: "#f9fafb",
  border: "#e5e7eb",
  borderLight: "#f0f0f0",
  text: "#1a1a1a",
  textMuted: "#6b7280",
  textFaint: "#a1a1aa",
  textGhost: "#c0c4cc",
  textDimmed: "#d1d5db",
  accent: "#16a34a",
  accentHover: "#15803d",
  btnBg: "#1a1a1a",
  btnText: "#ffffff",
  btnMuted: "#f0f0f0",
  danger: "#dc2626",
  dangerBorder: "#fecaca",
  mono: "'JetBrains Mono', monospace",
  sans: "'Inter', system-ui, sans-serif",
};

/* ── Components ── */

function Checkbox({ checked, onChange }) {
  return (
    <button onClick={onChange} style={{
      width: 24, height: 24, borderRadius: 24,
      border: `2px solid ${checked ? C.accent : C.textDimmed}`,
      background: checked ? C.accent : "transparent",
      cursor: "pointer", display: "flex",
      alignItems: "center", justifyContent: "center", flexShrink: 0,
      transition: "background 0.05s ease, border-color 0.05s ease",
    }}>
      {checked && (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2.5 6L5 8.5L9.5 3.5" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
    </button>
  );
}

function TaskItem({ task, onToggle, onUpdate, onDelete, index }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(task.name);
  const [notes, setNotes] = useState(task.notes || "");
  const [animating, setAnimating] = useState(false);
  const [visible, setVisible] = useState(false);
  const nameRef = useRef(null);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), (index || 0) * 60);
    return () => clearTimeout(t);
  }, [index]);

  useEffect(() => { if (editing && nameRef.current) nameRef.current.focus(); }, [editing]);

  const handleSave = () => {
    if (!name.trim()) return;
    onUpdate({ ...task, name: name.trim(), notes: notes.trim() });
    setEditing(false);
  };

  const handleCancel = () => {
    setName(task.name);
    setNotes(task.notes || "");
    setEditing(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSave(); }
    if (e.key === "Escape") handleCancel();
  };

  const [localCompleted, setLocalCompleted] = useState(task.completed);

  // Sync local state when task prop changes (e.g. from refresh)
  useEffect(() => { setLocalCompleted(task.completed); }, [task.completed]);

  const handleToggle = () => {
    setLocalCompleted(!localCompleted); // instant visual feedback
    setAnimating(true);
    setTimeout(() => { onToggle(task.id); setAnimating(false); }, 400);
  };

  if (editing) {
    return (
      <div style={{
        padding: "18px 22px", background: C.cardMuted, borderRadius: 14,
        border: `1.5px solid ${C.border}`, marginBottom: 6,
        opacity: visible ? 1 : 0, transition: "opacity 0.3s ease",
      }}>
        <input ref={nameRef} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={handleKeyDown}
          placeholder="Task name" style={{
            width: "100%", padding: "8px 0", border: "none", borderBottom: `1.5px solid ${C.border}`,
            background: "transparent", fontSize: 15, fontFamily: C.sans,
            fontWeight: 500, outline: "none", color: C.text, boxSizing: "border-box",
          }}
        />
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} onKeyDown={handleKeyDown}
          placeholder="Notes (optional)" rows={2} style={{
            width: "100%", padding: "8px 0", border: "none", background: "transparent",
            fontSize: 13, fontFamily: C.sans, outline: "none", color: C.textMuted,
            resize: "vertical", marginTop: 8, boxSizing: "border-box",
          }}
        />
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button onClick={handleSave} style={{
            padding: "7px 18px", background: C.btnBg, color: C.btnText, border: "none",
            borderRadius: 8, fontSize: 13, fontFamily: C.mono, fontWeight: 500, cursor: "pointer",
          }}>save</button>
          <button onClick={handleCancel} style={{
            padding: "7px 18px", background: "transparent", color: C.textMuted, border: `1px solid ${C.border}`,
            borderRadius: 8, fontSize: 13, fontFamily: C.mono, cursor: "pointer",
          }}>cancel</button>
          <button onClick={() => onDelete(task.id)} style={{
            padding: "7px 18px", background: "transparent", color: C.danger, border: `1px solid ${C.dangerBorder}`,
            borderRadius: 8, fontSize: 13, fontFamily: C.mono, cursor: "pointer", marginLeft: "auto",
          }}>delete</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      padding: "18px 22px",
      background: localCompleted ? C.cardMuted : C.card,
      borderRadius: 14,
      border: `1px solid ${localCompleted ? C.borderLight : C.border}`,
      marginBottom: 6,
      display: "flex", alignItems: "flex-start", gap: 16,
      transition: "all 0.5s cubic-bezier(0.22, 1, 0.36, 1)",
      opacity: visible ? (animating ? 0.5 : 1) : 0,
      transform: visible ? (animating ? "translateX(20px)" : "translateX(0)") : "translateY(12px)",
      cursor: "pointer",
      boxShadow: localCompleted ? "none" : "0 1px 3px rgba(0,0,0,0.03)",
    }} onClick={() => setEditing(true)}>
      <div style={{ paddingTop: 1 }} onClick={(e) => e.stopPropagation()}>
        <Checkbox checked={localCompleted} onChange={handleToggle} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 15, fontWeight: 500,
          color: localCompleted ? C.textGhost : C.text,
          fontFamily: C.sans,
          textDecoration: localCompleted ? "line-through" : "none",
          textDecorationColor: C.textDimmed,
          transition: "all 0.4s ease",
        }}>{task.name}</div>
        {task.notes && (
          <div style={{
            fontSize: 13, color: localCompleted ? "#d8dae0" : C.textMuted, marginTop: 5,
            fontFamily: C.sans, lineHeight: 1.4,
            transition: "color 0.4s ease",
          }}>{task.notes}</div>
        )}
      </div>
    </div>
  );
}

function ListView({ listId, onBack }) {
  const [list, setList] = useState(null);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const [copied, setCopied] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const inputRef = useRef(null);

  const refresh = useCallback(async () => {
    const data = await loadList(listId);
    if (data) { setList(data); setNotFound(false); }
    else setNotFound(true);
    setLoading(false);
  }, [listId]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    const interval = setInterval(refresh, 4000);
    return () => clearInterval(interval);
  }, [refresh]);

  const addTask = async () => {
    if (!newName.trim()) return;
    const task = {
      id: generateTaskId(),
      list_id: listId,
      name: newName.trim(),
      notes: newNotes.trim(),
      completed: false,
      created_at: new Date().toISOString(),
    };
    await addTaskDb(task);
    setNewName("");
    setNewNotes("");
    setShowNotes(false);
    inputRef.current?.focus();
    refresh();
  };

  const toggleTask = async (taskId) => {
    const task = list.tasks.find(t => t.id === taskId);
    if (!task) return;
    await updateTaskDb({ ...task, completed: !task.completed });
    refresh();
  };

  const handleUpdate = async (updatedTask) => {
    await updateTaskDb(updatedTask);
    refresh();
  };

  const handleDelete = async (taskId) => {
    await deleteTaskDb(taskId);
    refresh();
  };

  const copyLink = () => {
    const url = window.location.origin + window.location.pathname + "#" + listId;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (loading) return (
    <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
      <div style={{ color: C.textFaint, fontFamily: C.mono, fontSize: 14 }}>loading...</div>
    </div>
  );

  if (notFound) return (
    <div style={{ textAlign: "center", padding: 60 }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>🤷</div>
      <div style={{ fontFamily: C.sans, fontSize: 18, color: C.text, fontWeight: 600 }}>List not found</div>
      <div style={{ fontFamily: C.sans, fontSize: 14, color: C.textMuted, marginTop: 8 }}>
        This list does not exist or may have been deleted.
      </div>
      <button onClick={onBack} style={{
        marginTop: 24, padding: "10px 24px", background: C.btnBg, color: C.btnText,
        border: "none", borderRadius: 10, fontSize: 14, fontFamily: C.mono, fontWeight: 500, cursor: "pointer",
      }}>← go back</button>
    </div>
  );

  const active = list.tasks.filter(t => !t.completed);
  const completed = list.tasks.filter(t => t.completed);

  return (
    <div>
      <div style={{ marginBottom: 40 }}>
        <h1 style={{
          fontSize: 32, fontWeight: 700, color: C.text, margin: 0, lineHeight: 1.1,
          fontFamily: C.sans, letterSpacing: -0.5,
        }}>{list.name}</h1>
        <div style={{
          fontFamily: C.mono, fontSize: 12, color: C.textFaint, marginTop: 10,
          display: "flex", gap: 16,
        }}>
          <span>{active.length} active</span>
          <span>·</span>
          <span>{completed.length} done</span>
        </div>
      </div>

      <div style={{
        padding: "4px 4px 4px 20px", background: C.card, borderRadius: 14,
        border: `1px solid ${C.border}`, marginBottom: 24,
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <input ref={inputRef} value={newName} onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addTask(); } }}
            placeholder="Add a task..."
            style={{
              flex: 1, padding: "14px 0", border: "none", background: "transparent",
              fontSize: 15, fontFamily: C.sans, outline: "none", color: C.text,
            }}
          />
          <button onClick={addTask} disabled={!newName.trim()} style={{
            padding: "10px 20px",
            background: newName.trim() ? C.accent : C.btnMuted,
            color: newName.trim() ? "#fff" : C.textFaint,
            border: "none", borderRadius: 10,
            fontSize: 13, fontFamily: C.mono, fontWeight: 500,
            cursor: newName.trim() ? "pointer" : "default",
            transition: "all 0.3s ease",
          }}>add</button>
        </div>
        {(showNotes || newNotes) ? (
          <div style={{ padding: "0 0 10px 0" }}>
            <textarea value={newNotes} onChange={(e) => setNewNotes(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addTask(); } }}
              placeholder="Notes (optional)" rows={2} style={{
                width: "100%", padding: "8px 0", border: "none", borderTop: `1px solid ${C.border}`,
                background: "transparent", fontSize: 13, fontFamily: C.sans,
                outline: "none", color: C.textMuted, resize: "vertical", marginTop: 6, boxSizing: "border-box",
              }}
            />
          </div>
        ) : (
          <button onClick={() => setShowNotes(true)} style={{
            background: "none", border: "none", cursor: "pointer", fontFamily: C.mono,
            fontSize: 12, color: C.textFaint, padding: "4px 0 10px 0",
          }}>+ add notes</button>
        )}
      </div>

      {active.map((task, i) => (
        <TaskItem key={task.id} task={task} index={i} onToggle={toggleTask} onUpdate={handleUpdate} onDelete={handleDelete} />
      ))}

      {completed.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <div style={{
            fontFamily: C.mono, fontSize: 11, letterSpacing: 3,
            textTransform: "uppercase", color: C.textDimmed, marginBottom: 10, padding: "0 4px",
          }}>completed</div>
          {completed.map((task, i) => (
            <TaskItem key={task.id} task={task} index={i + active.length} onToggle={toggleTask} onUpdate={handleUpdate} onDelete={handleDelete} />
          ))}
        </div>
      )}

      {list.tasks.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 0", color: C.textDimmed }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
          <div style={{ fontFamily: C.sans, fontSize: 15 }}>No tasks yet — add one above</div>
        </div>
      )}
    </div>
  );
}

function HomeView({ onCreate, onOpen, onAdmin }) {
  const [joinId, setJoinId] = useState("");
  const [listName, setListName] = useState("");

  return (
    <div style={{ maxWidth: 440, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: 48 }}>
        <div style={{
          fontFamily: C.mono, fontSize: 11, letterSpacing: 4,
          textTransform: "uppercase", color: C.accent, marginBottom: 16,
        }}>⬡ shared task lists</div>
        <h1 style={{
          fontFamily: C.sans, fontSize: 36, fontWeight: 700,
          color: C.text, margin: 0, lineHeight: 1.1, letterSpacing: -0.5,
        }}>Tasks</h1>
        <p style={{
          fontFamily: C.sans, fontSize: 15, color: C.textMuted,
          marginTop: 12, lineHeight: 1.5,
        }}>Create a list and share the link with anyone.<br/>No accounts needed.</p>
      </div>

      <div style={{
        padding: "6px 6px 6px 22px", background: C.card, borderRadius: 14,
        border: `1px solid ${C.border}`, marginBottom: 12,
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
      }}>
        <div style={{
          fontFamily: C.mono, fontSize: 11, letterSpacing: 3,
          textTransform: "uppercase", color: C.textFaint, marginTop: 10, marginBottom: 6,
        }}>new list</div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <input value={listName} onChange={(e) => setListName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") onCreate(listName.trim() || "Untitled list"); }}
            placeholder="List name (e.g. Office supplies)" style={{
              flex: 1, padding: "12px 0", border: "none",
              background: "transparent", fontSize: 15, fontFamily: C.sans,
              fontWeight: 500, outline: "none", color: C.text, boxSizing: "border-box",
            }}
          />
          <button onClick={() => onCreate(listName.trim() || "Untitled list")} style={{
            padding: "10px 20px", background: C.accent, color: "#fff",
            border: "none", borderRadius: 10, fontSize: 13,
            fontFamily: C.mono, fontWeight: 500, cursor: "pointer",
            transition: "all 0.3s ease",
          }}>create →</button>
        </div>
      </div>

      <div style={{
        padding: "6px 6px 6px 22px", background: C.card, borderRadius: 14,
        border: `1px solid ${C.border}`,
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
      }}>
        <div style={{
          fontFamily: C.mono, fontSize: 11, letterSpacing: 3,
          textTransform: "uppercase", color: C.textFaint, marginTop: 10, marginBottom: 6,
        }}>open existing list</div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <input value={joinId} onChange={(e) => setJoinId(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && joinId.trim()) onOpen(joinId.trim()); }}
            placeholder="Paste list ID or link" style={{
              flex: 1, padding: "12px 0", border: "none",
              background: "transparent", fontSize: 15, fontFamily: C.mono,
              outline: "none", color: C.text, letterSpacing: 1, boxSizing: "border-box",
            }}
          />
          <button onClick={() => joinId.trim() && onOpen(joinId.trim())}
            disabled={!joinId.trim()} style={{
              padding: "10px 20px", background: joinId.trim() ? C.btnMuted : "#fafafa",
              color: joinId.trim() ? C.text : C.textDimmed, border: "none", borderRadius: 10,
              fontSize: 13, fontFamily: C.mono, fontWeight: 500,
              cursor: joinId.trim() ? "pointer" : "default",
            }}>open</button>
        </div>
      </div>

      <div style={{ textAlign: "center", marginTop: 32 }}>
        <button onClick={onAdmin} style={{
          background: "none", border: "none", cursor: "pointer", fontFamily: C.mono,
          fontSize: 12, color: C.textDimmed,
        }}>admin</button>
      </div>
    </div>
  );
}

/* ── Admin ── */

function AdminView({ onBack, onOpenList }) {
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(null);

  const handleLogin = () => {
    if (!ADMIN_PASSWORD) {
      setError("Admin password not configured. Add VITE_ADMIN_PASSWORD in Vercel.");
      return;
    }
    if (password === ADMIN_PASSWORD) {
      setAuthed(true);
      setError("");
      refresh();
    } else {
      setError("Wrong password");
    }
  };

  const refresh = async () => {
    setLoading(true);
    const data = await loadAllLists();
    setLists(data);
    setLoading(false);
  };

  const handleDelete = async (listId, listName) => {
    if (!confirm(`Delete "${listName}" and all its tasks? This cannot be undone.`)) return;
    setDeleting(listId);
    await deleteListDb(listId);
    setLists((prev) => prev.filter((l) => l.id !== listId));
    setDeleting(null);
  };

  if (!authed) {
    return (
      <div style={{ maxWidth: 400, margin: "0 auto" }}>
        <button onClick={onBack} style={{
          background: "none", border: "none", cursor: "pointer", fontFamily: C.mono,
          fontSize: 13, color: C.textFaint, padding: "4px 0", marginBottom: 32,
        }}>← back</button>
        <div style={{
          fontFamily: C.mono, fontSize: 11, letterSpacing: 4,
          textTransform: "uppercase", color: C.accent, marginBottom: 16,
        }}>⬡ admin</div>
        <h1 style={{
          fontFamily: C.sans, fontSize: 28, fontWeight: 700,
          color: C.text, margin: "0 0 8px 0", letterSpacing: -0.5,
        }}>Admin Panel</h1>
        <p style={{
          fontFamily: C.sans, fontSize: 14, color: C.textMuted, marginBottom: 24,
        }}>Enter admin password to manage lists.</p>
        <div style={{
          padding: "6px 6px 6px 22px", background: C.card, borderRadius: 14,
          border: `1px solid ${C.border}`, boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password"
              onKeyDown={(e) => { if (e.key === "Enter") handleLogin(); }}
              placeholder="Password" autoFocus style={{
                flex: 1, padding: "14px 0", border: "none",
                background: "transparent", fontSize: 16, fontFamily: C.mono,
                outline: "none", color: C.text, boxSizing: "border-box",
              }}
            />
            <button onClick={handleLogin} style={{
              padding: "10px 20px", background: C.btnBg, color: C.btnText,
              border: "none", borderRadius: 10, fontSize: 13,
              fontFamily: C.mono, fontWeight: 500, cursor: "pointer",
            }}>log in →</button>
          </div>
          {error && (
            <div style={{ fontFamily: C.sans, fontSize: 13, color: C.danger, padding: "8px 0 10px 0" }}>{error}</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 32 }}>
        <button onClick={onBack} style={{
          background: "none", border: "none", cursor: "pointer", fontFamily: C.mono,
          fontSize: 13, color: C.textFaint, padding: "4px 0",
        }}>← back</button>
        <button onClick={refresh} style={{
          background: C.btnMuted, border: "none", borderRadius: 8,
          padding: "6px 14px", cursor: "pointer", fontFamily: C.mono,
          fontSize: 12, color: C.textMuted,
        }}>↻ refresh</button>
      </div>

      <div style={{
        fontFamily: C.mono, fontSize: 11, letterSpacing: 4,
        textTransform: "uppercase", color: C.accent, marginBottom: 16,
      }}>⬡ admin</div>
      <h1 style={{
        fontFamily: C.sans, fontSize: 28, fontWeight: 700,
        color: C.text, margin: "0 0 6px 0", letterSpacing: -0.5,
      }}>All Lists</h1>
      <div style={{ fontFamily: C.mono, fontSize: 12, color: C.textFaint, marginBottom: 32 }}>
        {lists.length} list{lists.length !== 1 ? "s" : ""} total
      </div>

      {loading && (
        <div style={{ textAlign: "center", padding: 40, color: C.textFaint, fontFamily: C.mono, fontSize: 14 }}>
          loading...
        </div>
      )}

      {!loading && lists.length === 0 && (
        <div style={{ textAlign: "center", padding: 40, color: C.textDimmed }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📭</div>
          <div style={{ fontFamily: C.sans, fontSize: 15 }}>No lists yet</div>
        </div>
      )}

      {lists.map((list) => (
        <div key={list.id} style={{
          padding: "18px 22px", background: C.card, borderRadius: 14,
          border: `1px solid ${C.border}`, marginBottom: 6,
          display: "flex", alignItems: "center", gap: 14,
          boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: C.sans, fontSize: 15, fontWeight: 500, color: C.text,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>{list.name}</div>
            <div style={{
              fontFamily: C.mono, fontSize: 12, color: C.textFaint, marginTop: 5,
              display: "flex", gap: 14, flexWrap: "wrap",
            }}>
              <span>id: {list.id}</span>
              <span>{list.totalTasks} task{list.totalTasks !== 1 ? "s" : ""}</span>
              <span>{list.completedTasks} done</span>
              <span>{new Date(list.created_at).toLocaleDateString()}</span>
            </div>
          </div>
          <button onClick={() => onOpenList(list.id)} style={{
            padding: "7px 14px", background: C.btnMuted, border: "none", borderRadius: 8,
            fontSize: 12, fontFamily: C.mono, fontWeight: 500, cursor: "pointer", color: C.textMuted,
            flexShrink: 0,
          }}>open</button>
          <button onClick={() => handleDelete(list.id, list.name)}
            disabled={deleting === list.id} style={{
              padding: "7px 14px", background: deleting === list.id ? C.cardMuted : "transparent",
              color: deleting === list.id ? C.textFaint : C.danger,
              border: `1px solid ${C.dangerBorder}`, borderRadius: 8, fontSize: 12,
              fontFamily: C.mono, fontWeight: 500,
              cursor: deleting === list.id ? "default" : "pointer",
              flexShrink: 0,
            }}>{deleting === list.id ? "..." : "delete"}</button>
        </div>
      ))}
    </div>
  );
}

/* ── App ── */
export default function TaskManager() {
  const [currentList, setCurrentList] = useState(null);
  const [showAdmin, setShowAdmin] = useState(false);

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash === "admin") setShowAdmin(true);
    else if (hash) setCurrentList(hash);
  }, []);

  const navigate = (listId) => {
    setShowAdmin(false);
    if (listId) {
      window.location.hash = listId;
    } else {
      history.pushState(null, "", window.location.pathname);
    }
    setCurrentList(listId);
  };

  const navigateAdmin = () => {
    setCurrentList(null);
    setShowAdmin(true);
    window.location.hash = "admin";
  };

  useEffect(() => {
    const onHash = () => {
      const hash = window.location.hash.slice(1);
      if (hash === "admin") { setShowAdmin(true); setCurrentList(null); }
      else { setShowAdmin(false); setCurrentList(hash || null); }
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const handleCreate = async (name) => {
    const id = generateId();
    await createList(id, name);
    navigate(id);
  };

  const handleOpen = (input) => {
    const match = input.match(/#(.+)$/);
    const id = match ? match[1] : input.trim();
    navigate(id);
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: C.sans }}>
      <div style={{ maxWidth: 540, margin: "0 auto", padding: "56px 20px 80px" }}>
        {showAdmin ? (
          <AdminView onBack={() => navigate(null)} onOpenList={(id) => navigate(id)} />
        ) : currentList ? (
          <ListView listId={currentList} onBack={() => navigate(null)} />
        ) : (
          <HomeView onCreate={handleCreate} onOpen={handleOpen} onAdmin={navigateAdmin} />
        )}
      </div>
    </div>
  );
}
