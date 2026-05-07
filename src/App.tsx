import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type ReactNode } from 'react';

type NodeItem = {
  id: string;
  parentId: string | null;
  title: string;
  sortOrder: number;
  completed: boolean;
  collapsed: boolean;
  createdAt: string;
  updatedAt: string;
  version: number;
};

type CachePayload = { nodes: NodeItem[]; updatedAt?: string; cachedAt: string };
type DropPosition = 'before' | 'inside' | 'after';

const CACHE_KEY = 'taskflowy:last-tree';
const META_KEY = 'taskflowy:ui';

const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
const mod = isMac ? '⌘' : 'Ctrl';

const api = async <T,>(url: string, init?: RequestInit): Promise<T> => {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...init });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
};

function buildChildren(nodes: NodeItem[]) {
  const map = new Map<string | null, NodeItem[]>();
  for (const n of nodes) {
    const key = n.parentId ?? null;
    map.set(key, [...(map.get(key) ?? []), n]);
  }
  for (const items of map.values()) items.sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));
  return map;
}

function isDescendant(candidateParentId: string | null, nodeId: string, byId: Map<string, NodeItem>) {
  let cur = candidateParentId ? byId.get(candidateParentId) : undefined;
  while (cur) {
    if (cur.id === nodeId) return true;
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return false;
}

export default function App() {
  const [nodes, setNodes] = useState<NodeItem[]>([]);
  const [zoomId, setZoomId] = useState<string | null>(null);
  const [history, setHistory] = useState<(string | null)[]>([null]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [online, setOnline] = useState(true);
  const [status, setStatus] = useState('Loading…');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(() => JSON.parse(localStorage.getItem(META_KEY) || '{}').showCompleted ?? true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [dropTarget, setDropTarget] = useState<{ id: string; position: DropPosition } | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const searchRef = useRef<HTMLInputElement | null>(null);

  const children = useMemo(() => buildChildren(nodes), [nodes]);
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const visibleNodes = useMemo(() => {
    if (showCompleted) return nodes;
    const keep = new Set<string>();
    const markAncestors = (n: NodeItem) => {
      keep.add(n.id);
      let cur = n.parentId ? byId.get(n.parentId) : undefined;
      while (cur) { keep.add(cur.id); cur = cur.parentId ? byId.get(cur.parentId) : undefined; }
    };
    nodes.filter((n) => !n.completed).forEach(markAncestors);
    return nodes.filter((n) => keep.has(n.id));
  }, [nodes, showCompleted, byId]);
  const visibleChildren = useMemo(() => buildChildren(visibleNodes), [visibleNodes]);

  const fetchTree = useCallback(async (quiet = false) => {
    try {
      const data = await api<{ nodes: NodeItem[]; updatedAt?: string }>('/api/tree');
      setNodes(data.nodes);
      localStorage.setItem(CACHE_KEY, JSON.stringify({ nodes: data.nodes, updatedAt: data.updatedAt, cachedAt: new Date().toISOString() } satisfies CachePayload));
      setOnline(true);
      setStatus(`Synced ${new Date(data.updatedAt ?? Date.now()).toLocaleString()}`);
    } catch {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const parsed: CachePayload = JSON.parse(cached);
        setNodes(parsed.nodes);
        setOnline(false);
        setStatus(`Offline — cached ${new Date(parsed.cachedAt).toLocaleString()}. Editing is read-only.`);
      } else {
        setOnline(false);
        if (!quiet) setStatus('Offline and no cached outline is available yet. Start Taskflowy, then refresh.');
      }
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => fetchTree(), 0);
    const interval = window.setInterval(() => fetchTree(true), 30000);
    const onFocus = () => fetchTree(true);
    window.addEventListener('focus', onFocus);
    return () => { window.clearTimeout(initial); window.clearInterval(interval); window.removeEventListener('focus', onFocus); };
  }, [fetchTree]);

  useEffect(() => {
    localStorage.setItem(META_KEY, JSON.stringify({ showCompleted }));
  }, [showCompleted]);

  const goZoom = useCallback((id: string | null) => {
    setZoomId(id);
    const next = history.slice(0, historyIndex + 1);
    if (next.at(-1) !== id) next.push(id);
    setHistory(next);
    setHistoryIndex(next.length - 1);
  }, [history, historyIndex]);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '/') { e.preventDefault(); setHelpOpen((v) => !v); }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearchOpen(true); setTimeout(() => searchRef.current?.focus(), 20); }
      if (e.key === 'Escape') {
        if (helpOpen) { setHelpOpen(false); return; }
        if (searchOpen) { setSearchOpen(false); setQuery(''); return; }
        if (zoomId) goZoom(byId.get(zoomId)?.parentId ?? null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [helpOpen, searchOpen, zoomId, byId, goZoom]);

  const mutate = async (fn: () => Promise<unknown>, optimistic?: () => void, focusId?: string) => {
    if (!online) return;
    if (optimistic) optimistic();
    try {
      await fn();
      await fetchTree(true);
      if (focusId) setTimeout(() => inputRefs.current[focusId]?.focus(), 30);
    } catch {
      setOnline(false);
      setStatus('Server write failed — switched to safe offline view. Refresh after the server is back.');
      await fetchTree(true);
    }
  };

  const jumpHistory = (delta: -1 | 1) => {
    const next = historyIndex + delta;
    if (next < 0 || next >= history.length) return;
    setHistoryIndex(next);
    setZoomId(history[next]);
  };

  const updateNode = (id: string, patch: Partial<NodeItem>) => mutate(
    () => api(`/api/nodes/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    () => setNodes((prev) => prev.map((n) => n.id === id ? { ...n, ...patch, updatedAt: new Date().toISOString(), version: n.version + 1 } : n))
  );

  const createAfter = async (node: NodeItem) => {
    if (!online) return;
    const created = await api<{ node: { id: string } }>('/api/nodes', { method: 'POST', body: JSON.stringify({ afterId: node.id, title: '' }) });
    await fetchTree(true);
    setTimeout(() => inputRefs.current[created.node.id]?.focus(), 30);
  };

  const indent = async (node: NodeItem) => {
    const siblings = children.get(node.parentId ?? null) ?? [];
    const idx = siblings.findIndex((s) => s.id === node.id);
    const prev = siblings[idx - 1];
    if (!prev || isDescendant(prev.id, node.id, byId)) return;
    const newSibs = children.get(prev.id) ?? [];
    await mutate(() => api(`/api/nodes/${node.id}/reposition`, { method: 'POST', body: JSON.stringify({ parentId: prev.id, index: newSibs.length }) }));
  };

  const outdent = async (node: NodeItem) => {
    if (!node.parentId) return;
    const parent = byId.get(node.parentId);
    const newParentId = parent?.parentId ?? null;
    const newSibs = children.get(newParentId) ?? [];
    const parentIndex = newSibs.findIndex((s) => s.id === parent?.id);
    await mutate(() => api(`/api/nodes/${node.id}/reposition`, { method: 'POST', body: JSON.stringify({ parentId: newParentId, index: parentIndex + 1 }) }));
  };

  const move = (node: NodeItem, direction: 'up' | 'down') => mutate(() => api(`/api/nodes/${node.id}/move`, { method: 'POST', body: JSON.stringify({ direction }) }));
  const remove = (node: NodeItem) => mutate(() => api(`/api/nodes/${node.id}`, { method: 'DELETE' }));

  const reposition = (dragId: string, targetId: string, position: DropPosition) => {
    const target = byId.get(targetId);
    if (!target || dragId === targetId) return;
    const parentId = position === 'inside' ? target.id : target.parentId;
    if (isDescendant(parentId ?? null, dragId, byId)) return;
    const sibs = (children.get(parentId ?? null) ?? []).filter((n) => n.id !== dragId);
    let index = position === 'inside' ? (children.get(target.id)?.length ?? 0) : sibs.findIndex((n) => n.id === target.id) + (position === 'after' ? 1 : 0);
    if (index < 0) index = sibs.length;
    mutate(
      () => api(`/api/nodes/${dragId}/reposition`, { method: 'POST', body: JSON.stringify({ parentId, index }) }),
      () => setNodes((prev) => prev.map((n) => n.id === dragId ? { ...n, parentId: parentId ?? null, sortOrder: index * 1000 + 500 } : n))
    );
  };

  const ancestors = useMemo(() => {
    const list: NodeItem[] = [];
    let cur = zoomId ? byId.get(zoomId) : undefined;
    while (cur) { list.unshift(cur); cur = cur.parentId ? byId.get(cur.parentId) : undefined; }
    return list;
  }, [zoomId, byId]);

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return nodes.filter((n) => n.title.toLowerCase().includes(q)).slice(0, 20);
  }, [nodes, query]);

  const pathFor = (node: NodeItem) => {
    const names = [node.title || 'Untitled'];
    let cur = node.parentId ? byId.get(node.parentId) : undefined;
    while (cur) { names.unshift(cur.title || 'Untitled'); cur = cur.parentId ? byId.get(cur.parentId) : undefined; }
    return names.join(' / ');
  };

  const onNodeKeyDown = (e: KeyboardEvent<HTMLInputElement>, node: NodeItem) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); updateNode(node.id, { completed: !node.completed }); return; }
    if (e.key === 'Enter') { e.preventDefault(); void createAfter(node); return; }
    if (e.key === 'Tab') { e.preventDefault(); void (e.shiftKey ? outdent(node) : indent(node)); return; }
    if ((e.metaKey || e.ctrlKey) && e.key === 'ArrowUp') { e.preventDefault(); move(node, 'up'); return; }
    if ((e.metaKey || e.ctrlKey) && e.key === 'ArrowDown') { e.preventDefault(); move(node, 'down'); return; }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Backspace') { e.preventDefault(); remove(node); return; }
  };

  const renderNode = (node: NodeItem, depth = 0): ReactNode => {
    const kids = visibleChildren.get(node.id) ?? [];
    const hasHiddenCompleted = !showCompleted && (children.get(node.id) ?? []).length > kids.length;
    const dropClass = dropTarget?.id === node.id ? `drop-${dropTarget.position}` : '';
    const positionFromEvent = (e: DragEvent<HTMLDivElement>): DropPosition => {
      const rect = e.currentTarget.getBoundingClientRect();
      const y = e.clientY - rect.top;
      return y < rect.height * 0.28 ? 'before' : y > rect.height * 0.72 ? 'after' : 'inside';
    };
    const onDragOver = (e: DragEvent<HTMLDivElement>) => {
      const activeId = e.dataTransfer.getData('text/taskflowy-node') || draggingId;
      if (!activeId || activeId === node.id) return;
      e.preventDefault();
      setDropTarget({ id: node.id, position: positionFromEvent(e) });
    };
    return <div className="node-block" key={node.id} data-node-id={node.id}>
      <div
        className={`node-row ${selectedId === node.id ? 'selected' : ''} ${dropClass}`}
        style={{ paddingLeft: depth * 24 }}
        onDragOver={onDragOver}
        onDragLeave={() => setDropTarget(null)}
        onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData('text/taskflowy-node') || draggingId; if (id) reposition(id, node.id, dropTarget?.id === node.id ? dropTarget.position : positionFromEvent(e)); setDropTarget(null); setDraggingId(null); }}
      >
        <button className="twisty" aria-label={kids.length ? `${node.collapsed ? 'Expand' : 'Collapse'} ${node.title || 'node'}` : 'No children'} title="Expand/collapse" onClick={() => kids.length && updateNode(node.id, { collapsed: !node.collapsed })}>{kids.length ? (node.collapsed ? '▸' : '▾') : ''}</button>
        <button className="bullet" aria-label={`Zoom into ${node.title || 'Untitled'}`} title="Zoom into this bullet" onClick={() => goZoom(node.id)}>•</button>
        <button
          className="drag-handle"
          aria-label={`Drag ${node.title || 'Untitled'}`}
          title="Drag to move or nest"
          draggable={online}
          onDragStart={(e) => { setDraggingId(node.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/taskflowy-node', node.id); }}
          onDragEnd={() => { setDraggingId(null); setDropTarget(null); }}
        >⋮⋮</button>
        <input
          ref={(el) => { inputRefs.current[node.id] = el; }}
          disabled={!online}
          value={node.title}
          className={node.completed ? 'completed' : ''}
          placeholder="New bullet"
          onFocus={() => setSelectedId(node.id)}
          onChange={(e) => updateNode(node.id, { title: e.target.value })}
          onKeyDown={(e) => onNodeKeyDown(e, node)}
        />
        {hasHiddenCompleted && <span className="hidden-note">completed hidden</span>}
        <button className="done" aria-label={node.completed ? 'Mark incomplete' : 'Complete'} title="Complete" onClick={() => updateNode(node.id, { completed: !node.completed })}>✓</button>
        <button className="delete" aria-label="Delete" title="Delete" onClick={() => remove(node)}>×</button>
      </div>
      {!node.collapsed && kids.length > 0 && <div className="children">{kids.map((kid) => renderNode(kid, depth + 1))}</div>}
    </div>;
  };

  const visibleRoot = zoomId ? (visibleChildren.get(zoomId) ?? []) : (visibleChildren.get(null) ?? []);
  const zoomTitle = zoomId ? byId.get(zoomId)?.title || 'Untitled' : null;

  return <main className="app">
    <header className="topbar" aria-label="Taskflowy controls">
      <div className="brand" onClick={() => goZoom(null)} role="button" tabIndex={0}>
        <div className="brand-mark" aria-hidden="true">T</div>
        <div><h1>Taskflowy</h1><p>Local-first outline</p></div>
      </div>
      <div className="toolbar">
        <button onClick={() => jumpHistory(-1)} disabled={historyIndex === 0} aria-label="Back">←</button>
        <button onClick={() => jumpHistory(1)} disabled={historyIndex >= history.length - 1} aria-label="Forward">→</button>
        <button onClick={() => goZoom(null)}>Home</button>
        <button className="search-trigger" onClick={() => { setSearchOpen(true); setTimeout(() => searchRef.current?.focus(), 20); }}>Search <kbd>{mod}K</kbd></button>
        <label className="toggle"><input type="checkbox" checked={showCompleted} onChange={(e) => setShowCompleted(e.target.checked)} /> Show completed</label>
        <button onClick={() => setHelpOpen(true)}>Help <kbd>{mod}/</kbd></button>
      </div>
    </header>

    <div className={`status ${online ? 'online' : 'offline'}`}>{status}</div>

    <nav className="breadcrumbs" aria-label="Breadcrumbs">
      <button onClick={() => goZoom(null)}>Home</button>
      {ancestors.map((a) => <span key={a.id}>/ <button onClick={() => goZoom(a.id)}>{a.title || 'Untitled'}</button></span>)}
    </nav>

    {zoomId && <section className="zoom-title"><button onClick={() => goZoom(byId.get(zoomId)?.parentId ?? null)}>← Back</button><h2>{zoomTitle}</h2></section>}

    <section className="outline" aria-label="Outline">
      {visibleRoot.map((n) => renderNode(n))}
      {visibleRoot.length === 0 && <div className="empty"><strong>No bullets here yet.</strong><span>{online ? 'Press Enter on another bullet or go Home to keep outlining.' : 'You are offline, so this cached view is read-only.'}</span></div>}
    </section>

    {searchOpen && <div className="overlay" role="dialog" aria-modal="true" aria-label="Search outline">
      <div className="panel search-panel">
        <div className="panel-head"><h2>Search outline</h2><button onClick={() => { setSearchOpen(false); setQuery(''); }}>×</button></div>
        <input ref={searchRef} className="search-box" placeholder="Find any bullet…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="results">
          {query && searchResults.length === 0 && <p className="muted">No matching bullets.</p>}
          {searchResults.map((n) => <button key={n.id} className="result" onClick={() => { goZoom(n.id); setSearchOpen(false); setQuery(''); }}><span>{n.title || 'Untitled'}</span><small>{pathFor(n)}</small></button>)}
        </div>
      </div>
    </div>}

    {helpOpen && <div className="overlay" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
      <div className="panel help-panel">
        <div className="panel-head"><h2>Keyboard shortcuts</h2><button onClick={() => setHelpOpen(false)}>×</button></div>
        <dl className="shortcuts">
          <div><dt>Enter</dt><dd>New sibling bullet</dd></div>
          <div><dt>Tab / Shift+Tab</dt><dd>Indent / outdent</dd></div>
          <div><dt>{mod}+↑ / {mod}+↓</dt><dd>Move bullet up / down</dd></div>
          <div><dt>{mod}+Enter</dt><dd>Complete / reopen bullet</dd></div>
          <div><dt>{mod}+Backspace</dt><dd>Delete bullet and children</dd></div>
          <div><dt>Bullet click</dt><dd>Zoom into that bullet</dd></div>
          <div><dt>Esc</dt><dd>Close overlays, then zoom back</dd></div>
          <div><dt>{mod}+K</dt><dd>Search</dd></div>
          <div><dt>{mod}+/</dt><dd>Open this help</dd></div>
        </dl>
      </div>
    </div>}
  </main>;
}
