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

  // Get task counts for each list
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

async function deleteList(listId) {
  // Tasks are deleted automatically via ON DELETE CASCADE
  const { error } = await supabase.from("lists").delete().eq("id", listId);
  return !error;
}

/* ── Components ── */

function Checkbox({ checked, onChange }) {
  return (
    <button onClick={onChange} style={{
      width: 22, height: 22, borderRadius: 4, border: `2px solid ${checked ? "#3d6b4f" : "#bbb5a7"}`,
      background: checked ? "#3d6b4f" : "transparent", cursor: "pointer", display: "flex",
      alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.2s ease",
    }}>
      {checked && (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2.5 6L5 8.5L9.5 3.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
    </button>
  );
}

function TaskItem({ task, onToggle, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(task.name);
  const [notes, setNotes] = useState(task.notes || "");
  const nameRef = useRef(null);

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

  if (editing) {
    return (
      <div style={{
        padding: "16px 20px", background: "#faf8f4", borderRadius: 10,
        border: "1.5px solid #d4cfc4", marginBottom: 8,
      }}>
        <input ref={nameRef} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={handleKeyDown}
          placeholder="Task name" style={{
            width: "100%", padding: "8px 0", border: "none", borderBottom: "1.5px solid #d4cfc4",
            background: "transparent", fontSize: 15, fontFamily: "'DM Sans', sans-serif",
            fontWeight: 500, outline: "none", color: "#2c2a25", boxSizing: "border-box",
          }}
        />
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} onKeyDown={handleKeyDown}
          placeholder="Notes (optional)" rows={2} style={{
            width: "100%", padding: "8px 0", border: "none", background: "transparent",
            fontSize: 13, fontFamily: "'DM Sans', sans-serif", outline: "none", color: "#6b6660",
            resize: "vertical", marginTop: 8, boxSizing: "border-box",
          }}
        />
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button onClick={handleSave} style={{
            padding: "6px 16px", background: "#2c2a25", color: "#faf8f4", border: "none",
            borderRadius: 6, fontSize: 13, fontFamily: "'DM Mono', monospace", cursor: "pointer",
          }}>save</button>
          <button onClick={handleCancel} style={{
            padding: "6px 16px", background: "transparent", color: "#6b6660", border: "1px solid #d4cfc4",
            borderRadius: 6, fontSize: 13, fontFamily: "'DM Mono', monospace", cursor: "pointer",
          }}>cancel</button>
          <button onClick={() => onDelete(task.id)} style={{
            padding: "6px 16px", background: "transparent", color: "#c44", border: "1px solid #e4cccc",
            borderRadius: 6, fontSize: 13, fontFamily: "'DM Mono', monospace", cursor: "pointer", marginLeft: "auto",
          }}>delete</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      padding: "14px 20px", background: task.completed ? "#f5f3ee" : "#fff",
      borderRadius: 10, border: "1px solid #e8e4dc", marginBottom: 8,
      display: "flex", alignItems: "flex-start", gap: 14, transition: "all 0.2s ease",
      cursor: "pointer",
    }} onClick={() => setEditing(true)}>
      <div style={{ paddingTop: 1 }} onClick={(e) => e.stopPropagation()}>
        <Checkbox checked={task.completed} onChange={() => onToggle(task.id)} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 15, fontWeight: 500, color: task.completed ? "#a09b93" : "#2c2a25",
          fontFamily: "'DM Sans', sans-serif",
          textDecoration: task.completed ? "line-through" : "none",
          transition: "all 0.2s ease",
        }}>{task.name}</div>
        {task.notes && (
          <div style={{
            fontSize: 13, color: task.completed ? "#c4c0b8" : "#8a847b", marginTop: 4,
            fontFamily: "'DM Sans', sans-serif", lineHeight: 1.4,
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

  // Auto-refresh every 4 seconds for collaboration
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
      <div style={{ color: "#a09b93", fontFamily: "'DM Mono', monospace", fontSize: 14 }}>loading...</div>
    </div>
  );

  if (notFound) return (
    <div style={{ textAlign: "center", padding: 60 }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>🤷</div>
      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 18, color: "#2c2a25", fontWeight: 600 }}>List not found</div>
      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: "#8a847b", marginTop: 8 }}>
        This list doesn't exist or may have been deleted.
      </div>
      <button onClick={onBack} style={{
        marginTop: 24, padding: "10px 24px", background: "#2c2a25", color: "#faf8f4",
        border: "none", borderRadius: 8, fontSize: 14, fontFamily: "'DM Mono', monospace", cursor: "pointer",
      }}>← go back</button>
    </div>
  );

  const active = list.tasks.filter(t => !t.completed);
  const completed = list.tasks.filter(t => t.completed);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 32 }}>
        <button onClick={onBack} style={{
          background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Mono', monospace",
          fontSize: 13, color: "#8a847b", padding: "4px 0",
        }}>← new list</button>
        <button onClick={copyLink} style={{
          background: copied ? "#3d6b4f" : "#f0ece4", border: "none", borderRadius: 6,
          padding: "6px 14px", cursor: "pointer", fontFamily: "'DM Mono', monospace",
          fontSize: 12, color: copied ? "#fff" : "#6b6660", transition: "all 0.2s ease",
        }}>{copied ? "link copied ✓" : "copy share link"}</button>
      </div>

      <h1 style={{
        fontFamily: "'DM Sans', sans-serif", fontSize: 28, fontWeight: 700,
        color: "#2c2a25", margin: "0 0 6px 0",
      }}>{list.name}</h1>
      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: "#a09b93", marginBottom: 32 }}>
        {list.tasks.length} task{list.tasks.length !== 1 ? "s" : ""} · {completed.length} done
      </div>

      {/* Add task */}
      <div style={{
        padding: "16px 20px", background: "#faf8f4", borderRadius: 10,
        border: "1.5px dashed #d4cfc4", marginBottom: 24,
      }}>
        <div style={{ display: "flex", gap: 10 }}>
          <input ref={inputRef} value={newName} onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addTask(); } }}
            placeholder="Add a task..."
            style={{
              flex: 1, padding: "8px 0", border: "none", background: "transparent",
              fontSize: 15, fontFamily: "'DM Sans', sans-serif", fontWeight: 500,
              outline: "none", color: "#2c2a25",
            }}
          />
          <button onClick={addTask} disabled={!newName.trim()} style={{
            padding: "6px 18px", background: newName.trim() ? "#2c2a25" : "#e8e4dc",
            color: newName.trim() ? "#faf8f4" : "#a09b93", border: "none", borderRadius: 6,
            fontSize: 13, fontFamily: "'DM Mono', monospace", cursor: newName.trim() ? "pointer" : "default",
            transition: "all 0.2s ease",
          }}>add</button>
        </div>
        {(showNotes || newNotes) ? (
          <textarea value={newNotes} onChange={(e) => setNewNotes(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addTask(); } }}
            placeholder="Notes (optional)" rows={2} style={{
              width: "100%", padding: "8px 0", border: "none", borderTop: "1px solid #e8e4dc",
              background: "transparent", fontSize: 13, fontFamily: "'DM Sans', sans-serif",
              outline: "none", color: "#6b6660", resize: "vertical", marginTop: 10, boxSizing: "border-box",
            }}
          />
        ) : (
          <button onClick={() => setShowNotes(true)} style={{
            background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Mono', monospace",
            fontSize: 12, color: "#a09b93", padding: "6px 0 0 0",
          }}>+ add notes</button>
        )}
      </div>

      {/* Active tasks */}
      {active.map(task => (
        <TaskItem key={task.id} task={task} onToggle={toggleTask} onUpdate={handleUpdate} onDelete={handleDelete} />
      ))}

      {/* Completed tasks */}
      {completed.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div style={{
            fontFamily: "'DM Mono', monospace", fontSize: 12, color: "#a09b93",
            marginBottom: 10, padding: "0 4px",
          }}>completed ({completed.length})</div>
          {completed.map(task => (
            <TaskItem key={task.id} task={task} onToggle={toggleTask} onUpdate={handleUpdate} onDelete={handleDelete} />
          ))}
        </div>
      )}

      {list.tasks.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 0", color: "#c4c0b8" }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15 }}>No tasks yet — add one above</div>
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
          fontFamily: "'DM Mono', monospace", fontSize: 11, letterSpacing: 3,
          textTransform: "uppercase", color: "#a09b93", marginBottom: 12,
        }}>shared task lists</div>
        <h1 style={{
          fontFamily: "'DM Sans', sans-serif", fontSize: 36, fontWeight: 700,
          color: "#2c2a25", margin: 0, lineHeight: 1.2,
        }}>Tasks</h1>
        <p style={{
          fontFamily: "'DM Sans', sans-serif", fontSize: 15, color: "#8a847b",
          marginTop: 12, lineHeight: 1.5,
        }}>Create a list and share the link with anyone.<br/>No accounts needed.</p>
      </div>

      <div style={{
        padding: 24, background: "#fff", borderRadius: 12,
        border: "1px solid #e8e4dc", marginBottom: 16,
      }}>
        <div style={{
          fontFamily: "'DM Mono', monospace", fontSize: 11, letterSpacing: 2,
          textTransform: "uppercase", color: "#a09b93", marginBottom: 14,
        }}>new list</div>
        <input value={listName} onChange={(e) => setListName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") onCreate(listName.trim() || "Untitled list"); }}
          placeholder="List name (e.g. Office supplies)" style={{
            width: "100%", padding: "12px 0", border: "none", borderBottom: "1.5px solid #e8e4dc",
            background: "transparent", fontSize: 16, fontFamily: "'DM Sans', sans-serif",
            fontWeight: 500, outline: "none", color: "#2c2a25", boxSizing: "border-box",
          }}
        />
        <button onClick={() => onCreate(listName.trim() || "Untitled list")} style={{
          width: "100%", marginTop: 16, padding: "12px", background: "#2c2a25",
          color: "#faf8f4", border: "none", borderRadius: 8, fontSize: 14,
          fontFamily: "'DM Mono', monospace", cursor: "pointer", fontWeight: 500, letterSpacing: 0.5,
        }}>create list →</button>
      </div>

      <div style={{
        padding: 24, background: "#fff", borderRadius: 12,
        border: "1px solid #e8e4dc",
      }}>
        <div style={{
          fontFamily: "'DM Mono', monospace", fontSize: 11, letterSpacing: 2,
          textTransform: "uppercase", color: "#a09b93", marginBottom: 14,
        }}>open existing list</div>
        <div style={{ display: "flex", gap: 10 }}>
          <input value={joinId} onChange={(e) => setJoinId(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && joinId.trim()) onOpen(joinId.trim()); }}
            placeholder="Paste list ID or link" style={{
              flex: 1, padding: "12px 0", border: "none", borderBottom: "1.5px solid #e8e4dc",
              background: "transparent", fontSize: 15, fontFamily: "'DM Mono', monospace",
              outline: "none", color: "#2c2a25", letterSpacing: 1, boxSizing: "border-box",
            }}
          />
          <button onClick={() => joinId.trim() && onOpen(joinId.trim())}
            disabled={!joinId.trim()} style={{
              padding: "10px 20px", background: joinId.trim() ? "#f0ece4" : "#f5f3ee",
              color: joinId.trim() ? "#2c2a25" : "#c4c0b8", border: "none", borderRadius: 8,
              fontSize: 14, fontFamily: "'DM Mono', monospace", cursor: joinId.trim() ? "pointer" : "default",
              alignSelf: "flex-end",
            }}>open</button>
        </div>
      </div>

      {/* Admin link */}
      <div style={{ textAlign: "center", marginTop: 32 }}>
        <button onClick={onAdmin} style={{
          background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Mono', monospace",
          fontSize: 12, color: "#c4c0b8",
        }}>admin</button>
      </div>
    </div>
  );
}

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
    await deleteList(listId);
    setLists((prev) => prev.filter((l) => l.id !== listId));
    setDeleting(null);
  };

  if (!authed) {
    return (
      <div style={{ maxWidth: 400, margin: "0 auto" }}>
        <button onClick={onBack} style={{
          background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Mono', monospace",
          fontSize: 13, color: "#8a847b", padding: "4px 0", marginBottom: 32,
        }}>← back</button>
        <h1 style={{
          fontFamily: "'DM Sans', sans-serif", fontSize: 28, fontWeight: 700,
          color: "#2c2a25", margin: "0 0 8px 0",
        }}>Admin</h1>
        <p style={{
          fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: "#8a847b", marginBottom: 24,
        }}>Enter admin password to manage lists.</p>
        <div style={{
          padding: 24, background: "#fff", borderRadius: 12, border: "1px solid #e8e4dc",
        }}>
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password"
            onKeyDown={(e) => { if (e.key === "Enter") handleLogin(); }}
            placeholder="Password" autoFocus style={{
              width: "100%", padding: "12px 0", border: "none", borderBottom: "1.5px solid #e8e4dc",
              background: "transparent", fontSize: 16, fontFamily: "'DM Mono', monospace",
              outline: "none", color: "#2c2a25", boxSizing: "border-box",
            }}
          />
          {error && (
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#c44", marginTop: 10 }}>{error}</div>
          )}
          <button onClick={handleLogin} style={{
            width: "100%", marginTop: 16, padding: "12px", background: "#2c2a25",
            color: "#faf8f4", border: "none", borderRadius: 8, fontSize: 14,
            fontFamily: "'DM Mono', monospace", cursor: "pointer",
          }}>log in →</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 32 }}>
        <button onClick={onBack} style={{
          background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Mono', monospace",
          fontSize: 13, color: "#8a847b", padding: "4px 0",
        }}>← back</button>
        <button onClick={refresh} style={{
          background: "#f0ece4", border: "none", borderRadius: 6,
          padding: "6px 14px", cursor: "pointer", fontFamily: "'DM Mono', monospace",
          fontSize: 12, color: "#6b6660",
        }}>↻ refresh</button>
      </div>

      <h1 style={{
        fontFamily: "'DM Sans', sans-serif", fontSize: 28, fontWeight: 700,
        color: "#2c2a25", margin: "0 0 6px 0",
      }}>Admin Panel</h1>
      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: "#a09b93", marginBottom: 32 }}>
        {lists.length} list{lists.length !== 1 ? "s" : ""} total
      </div>

      {loading && (
        <div style={{ textAlign: "center", padding: 40, color: "#a09b93", fontFamily: "'DM Mono', monospace", fontSize: 14 }}>
          loading...
        </div>
      )}

      {!loading && lists.length === 0 && (
        <div style={{ textAlign: "center", padding: 40, color: "#c4c0b8" }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📭</div>
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15 }}>No lists yet</div>
        </div>
      )}

      {lists.map((list) => (
        <div key={list.id} style={{
          padding: "16px 20px", background: "#fff", borderRadius: 10,
          border: "1px solid #e8e4dc", marginBottom: 8,
          display: "flex", alignItems: "center", gap: 14,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 500, color: "#2c2a25",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>{list.name}</div>
            <div style={{
              fontFamily: "'DM Mono', monospace", fontSize: 12, color: "#a09b93", marginTop: 4,
              display: "flex", gap: 12, flexWrap: "wrap",
            }}>
              <span>id: {list.id}</span>
              <span>{list.totalTasks} task{list.totalTasks !== 1 ? "s" : ""}</span>
              <span>{list.completedTasks} done</span>
              <span>{new Date(list.created_at).toLocaleDateString()}</span>
            </div>
          </div>
          <button onClick={() => onOpenList(list.id)} style={{
            padding: "6px 12px", background: "#f0ece4", border: "none", borderRadius: 6,
            fontSize: 12, fontFamily: "'DM Mono', monospace", cursor: "pointer", color: "#6b6660",
            flexShrink: 0,
          }}>open</button>
          <button onClick={() => handleDelete(list.id, list.name)}
            disabled={deleting === list.id} style={{
              padding: "6px 12px", background: deleting === list.id ? "#f5f3ee" : "transparent",
              color: deleting === list.id ? "#a09b93" : "#c44",
              border: "1px solid #e4cccc", borderRadius: 6, fontSize: 12,
              fontFamily: "'DM Mono', monospace", cursor: deleting === list.id ? "default" : "pointer",
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

  // Read from URL hash on load
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash === "admin") setShowAdmin(true);
    else if (hash) setCurrentList(hash);
  }, []);

  // Update URL hash when navigating
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

  // Handle browser back/forward
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
    <div style={{ minHeight: "100vh", background: "#f5f3ee", fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ maxWidth: 560, margin: "0 auto", padding: "48px 20px 80px" }}>
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
