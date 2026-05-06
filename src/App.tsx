import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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
const CACHE_KEY = 'workflowy-clone:last-tree';

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
  for (const items of map.values()) items.sort((a, b) => a.sortOrder - b.sortOrder);
  return map;
}

export default function App() {
  const [nodes, setNodes] = useState<NodeItem[]>([]);
  const [zoomId, setZoomId] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [status, setStatus] = useState('Loading…');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const children = useMemo(() => buildChildren(nodes), [nodes]);
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const fetchTree = useCallback(async (quiet = false) => {
    try {
      const data = await api<{ nodes: NodeItem[]; updatedAt?: string }>('/api/tree');
      setNodes(data.nodes);
      localStorage.setItem(CACHE_KEY, JSON.stringify({ nodes: data.nodes, updatedAt: data.updatedAt, cachedAt: new Date().toISOString() } satisfies CachePayload));
      setOnline(true);
      setStatus(`Saved locally • latest ${new Date(data.updatedAt ?? Date.now()).toLocaleString()}`);
    } catch {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const parsed: CachePayload = JSON.parse(cached);
        setNodes(parsed.nodes);
        setOnline(false);
        setStatus(`Offline — viewing cached copy from ${new Date(parsed.cachedAt).toLocaleString()}. Editing is disabled.`);
      } else {
        setOnline(false);
        if (!quiet) setStatus('Offline and no cached outline is available yet. Start the server, then refresh.');
      }
    }
  }, []);

  useEffect(() => {
    fetchTree();
    const interval = window.setInterval(() => fetchTree(true), 30000);
    const onFocus = () => fetchTree(true);
    window.addEventListener('focus', onFocus);
    return () => { window.clearInterval(interval); window.removeEventListener('focus', onFocus); };
  }, [fetchTree]);

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
    if (!prev) return;
    const newSibs = children.get(prev.id) ?? [];
    await mutate(() => api(`/api/nodes/${node.id}`, { method: 'PATCH', body: JSON.stringify({ parentId: prev.id, sortOrder: (newSibs.at(-1)?.sortOrder ?? 0) + 1000 }) }));
  };

  const outdent = async (node: NodeItem) => {
    if (!node.parentId) return;
    const parent = byId.get(node.parentId);
    const newParentId = parent?.parentId ?? null;
    const newSibs = children.get(newParentId) ?? [];
    const afterParentOrder = parent?.sortOrder ?? (newSibs.at(-1)?.sortOrder ?? 0);
    await mutate(() => api(`/api/nodes/${node.id}`, { method: 'PATCH', body: JSON.stringify({ parentId: newParentId, sortOrder: afterParentOrder + 500 }) }));
  };

  const move = (node: NodeItem, direction: 'up' | 'down') => mutate(() => api(`/api/nodes/${node.id}/move`, { method: 'POST', body: JSON.stringify({ direction }) }));
  const remove = (node: NodeItem) => mutate(() => api(`/api/nodes/${node.id}`, { method: 'DELETE' }), undefined);

  const ancestors = useMemo(() => {
    const list: NodeItem[] = [];
    let cur = zoomId ? byId.get(zoomId) : undefined;
    while (cur) { list.unshift(cur); cur = cur.parentId ? byId.get(cur.parentId) : undefined; }
    return list;
  }, [zoomId, byId]);

  const renderNode = (node: NodeItem, depth = 0): JSX.Element => {
    const kids = children.get(node.id) ?? [];
    return <div className="node-block" key={node.id} data-node-id={node.id}>
      <div className={`node-row ${selectedId === node.id ? 'selected' : ''}`} style={{ paddingLeft: depth * 24 }}>
        <button className="bullet" aria-label={`Zoom ${node.title || 'node'}`} onClick={() => setZoomId(node.id)}>•</button>
        <button className="twisty" title="Collapse/expand" onClick={() => updateNode(node.id, { collapsed: !node.collapsed })}>{kids.length ? (node.collapsed ? '▸' : '▾') : ' '}</button>
        <input
          ref={(el) => { inputRefs.current[node.id] = el; }}
          disabled={!online}
          value={node.title}
          className={node.completed ? 'completed' : ''}
          placeholder="Untitled"
          onFocus={() => setSelectedId(node.id)}
          onChange={(e) => updateNode(node.id, { title: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); updateNode(node.id, { completed: !node.completed }); return; }
            if (e.key === 'Enter') { e.preventDefault(); void createAfter(node); return; }
            if (e.key === 'Tab') { e.preventDefault(); void (e.shiftKey ? outdent(node) : indent(node)); return; }
            if ((e.metaKey || e.ctrlKey) && e.key === 'ArrowUp') { e.preventDefault(); move(node, 'up'); return; }
            if ((e.metaKey || e.ctrlKey) && e.key === 'ArrowDown') { e.preventDefault(); move(node, 'down'); return; }
            if ((e.metaKey || e.ctrlKey) && e.key === 'Backspace') { e.preventDefault(); remove(node); return; }
          }}
        />
        <button className="done" title="Complete" onClick={() => updateNode(node.id, { completed: !node.completed })}>✓</button>
        <button className="delete" title="Delete" onClick={() => remove(node)}>×</button>
      </div>
      {!node.collapsed && kids.length > 0 && <div className="children">{kids.map((kid) => renderNode(kid, depth + 1))}</div>}
    </div>;
  };

  const visibleRoot = zoomId ? (children.get(zoomId) ?? []) : (children.get(null) ?? []);

  return <main className="app">
    <div className={`status ${online ? 'online' : 'offline'}`}>{status}</div>
    <nav className="breadcrumbs">
      <button onClick={() => setZoomId(null)}>Home</button>
      {ancestors.map((a) => <span key={a.id}>/ <button onClick={() => setZoomId(a.id)}>{a.title || 'Untitled'}</button></span>)}
    </nav>
    {zoomId && <header className="zoom-title"><button onClick={() => setZoomId(byId.get(zoomId)?.parentId ?? null)}>← Back</button><h1>{byId.get(zoomId)?.title}</h1></header>}
    <section className="outline" aria-label="Outline">
      {visibleRoot.map((n) => renderNode(n))}
      {visibleRoot.length === 0 && <p className="empty">No bullets here yet.</p>}
    </section>
    <footer className="help">Enter sibling • Tab indent • Shift+Tab outdent • Cmd/Ctrl+↑↓ move • Cmd/Ctrl+Enter complete • Cmd/Ctrl+Backspace delete</footer>
  </main>;
}
