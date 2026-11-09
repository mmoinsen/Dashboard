import { defineIntegration, limitOption } from './types.ts';
import type { Context } from './types.ts';
import { HttpError } from '../lib/http.ts';
import { bytes, duration, num, percent } from '../lib/format.ts';
import { bestScore } from '../lib/match.ts';
import type { ActionRef, BarItem, ListItem, SearchResult, Tone } from '../shared/types.ts';

/** One entry of /cluster/resources (fields depend on the type). */
interface Resource {
  id: string;
  type: 'node' | 'qemu' | 'lxc' | 'storage' | 'pool' | 'sdn';
  node: string;
  name?: string;
  storage?: string;
  status?: string;
  vmid?: number;
  template?: number;
  cpu?: number; // 0..1 of maxcpu
  maxcpu?: number;
  mem?: number;
  maxmem?: number;
  disk?: number;
  maxdisk?: number;
  uptime?: number;
  shared?: number;
}

async function resources(ctx: Context, fresh = false): Promise<Resource[]> {
  if (fresh) ctx.cache.delete(`${ctx.service.id}:resources`);
  return ctx.cache.get(`${ctx.service.id}:resources`, 4000, async () => (await ctx.http.get<{ data: Resource[] }>('/api2/json/cluster/resources')).data);
}

const STATUS: Record<string, string> = { running: 'läuft', stopped: 'gestoppt', paused: 'pausiert', suspended: 'angehalten', online: 'online', offline: 'offline', unknown: 'unbekannt' };
const statusText = (s?: string) => (s ? (STATUS[s] ?? s) : '–');

const isGuest = (r: Resource) => (r.type === 'qemu' || r.type === 'lxc') && !r.template;
const kind = (r: Resource) => (r.type === 'qemu' ? 'VM' : 'LXC');
const pct = (used?: number, max?: number) => (used != null && max ? (used / max) * 100 : 0);
const level = (p: number): Tone => (p > 90 ? 'bad' : p > 75 ? 'warn' : 'accent');

function guestTone(r: Resource): Tone {
  if (r.status === 'running') return 'ok';
  if (r.status === 'paused' || r.status === 'suspended') return 'warn';
  return 'muted';
}

function guestActions(ctx: Context, r: Resource): ActionRef[] {
  const params = { node: r.node, type: r.type, vmid: r.vmid, name: r.name };
  if (r.status === 'running') {
    return [
      { service: ctx.service.id, action: 'reboot', params, label: 'Neustarten', confirm: `${kind(r)} „${r.name}“ neu starten?` },
      { service: ctx.service.id, action: 'shutdown', params, label: 'Herunterfahren', tone: 'bad', confirm: `${kind(r)} „${r.name}“ herunterfahren?` },
    ];
  }
  return [{ service: ctx.service.id, action: 'start', params, label: 'Starten', tone: 'accent' }];
}

function guestItem(ctx: Context, r: Resource): ListItem {
  const running = r.status === 'running';
  return {
    title: r.name ?? `${kind(r)} ${r.vmid}`,
    subtitle: `${kind(r)} ${r.vmid} · ${r.node}${running && r.maxmem && r.mem != null ? ` · ${bytes(r.mem)} / ${bytes(r.maxmem)} RAM` : ''}`,
    // right after a start Proxmox may not report usage yet – show only what is known
    meta: running ? [r.cpu != null ? `CPU ${percent(r.cpu * 100, 0)}` : '', r.uptime ? duration(r.uptime) : 'gestartet'].filter(Boolean).join(' · ') : statusText(r.status),
    status: guestTone(r),
    actions: guestActions(ctx, r),
  };
}

function nodeBars(nodes: Resource[]): BarItem[] {
  return nodes.flatMap((n) =>
    n.status !== 'online'
      ? [{ label: `${n.node} · offline`, value: '–', percent: 0, tone: 'bad' as Tone }]
      : [
          { label: `${n.node} · CPU`, value: `${num((n.cpu ?? 0) * 100, 0)} % von ${n.maxcpu ?? '?'} Kernen`, percent: (n.cpu ?? 0) * 100, tone: level((n.cpu ?? 0) * 100) },
          { label: `${n.node} · RAM`, value: `${bytes(n.mem)} / ${bytes(n.maxmem)}`, percent: pct(n.mem, n.maxmem), tone: level(pct(n.mem, n.maxmem)) },
        ],
  );
}

function overviewBlocks(all: Resource[]) {
  const nodes = all.filter((r) => r.type === 'node').sort((a, b) => a.node.localeCompare(b.node));
  const vms = all.filter((r) => r.type === 'qemu' && !r.template);
  const lxcs = all.filter((r) => r.type === 'lxc' && !r.template);
  const online = nodes.filter((n) => n.status === 'online').length;
  return {
    nodes,
    summary: `${online}/${nodes.length} Nodes online · ${vms.filter((v) => v.status === 'running').length + lxcs.filter((v) => v.status === 'running').length} Gäste laufen`,
    status: (online < nodes.length ? 'bad' : 'ok') as Tone,
    blocks: [
      {
        type: 'stats' as const,
        items: [
          { label: 'Nodes', value: `${online}/${nodes.length}`, tone: (online < nodes.length ? 'bad' : 'ok') as Tone },
          { label: 'VMs aktiv', value: `${vms.filter((v) => v.status === 'running').length}/${vms.length}` },
          { label: 'LXC aktiv', value: `${lxcs.filter((v) => v.status === 'running').length}/${lxcs.length}` },
        ],
      },
      { type: 'bars' as const, items: nodeBars(nodes) },
    ],
  };
}

/** VM.PowerMgmt is missing on the token → explain instead of a bare 403. */
async function power(ctx: Context, p: Record<string, any>, cmd: 'start' | 'shutdown' | 'stop' | 'reboot', done: string) {
  const type = p.type === 'lxc' ? 'lxc' : 'qemu';
  const vmid = Number(p.vmid);
  if (!p.node || !vmid) return { ok: false, message: 'Ungültige VM' };
  try {
    await ctx.http.post(`/api2/json/nodes/${encodeURIComponent(p.node)}/${type}/${vmid}/status/${cmd}`, new URLSearchParams());
  } catch (err) {
    if (err instanceof HttpError && err.status === 403) {
      return { ok: false, message: 'Keine Berechtigung – das API-Token braucht das Recht „VM.PowerMgmt“ (z. B. Rolle PVEVMUser).' };
    }
    throw err;
  }
  ctx.cache.delete(`${ctx.service.id}:resources`);
  ctx.cache.delete(`${ctx.service.id}:w:`);
  return { ok: true, message: `${p.name ?? vmid}: ${done}` };
}

export default defineIntegration({
  id: 'proxmox',
  name: 'Proxmox VE',
  icon: 'proxmox',
  category: 'system',
  description: 'Nodes, VMs und Container: Auslastung, Status, Starten/Herunterfahren/Neustarten',
  website: 'https://pve.proxmox.com/wiki/Proxmox_VE_API',
  bang: 'pve',
  urlPlaceholder: 'https://192.168.1.10:8006',
  urlHelp:
    'Adresse der Proxmox-Weboberfläche inkl. Port 8006 (immer https – http:// wird automatisch umgestellt). Proxmox nutzt meist ein selbstsigniertes Zertifikat, deshalb ist „TLS-Zertifikat nicht prüfen“ vorausgewählt.',
  defaultInsecure: true,
  // pveproxy on 8006 only speaks HTTPS; an http:// URL would just bounce to https
  connection: (service) => ({ baseUrl: service.url.replace(/^http:\/\//i, 'https://') }),
  fields: [
    {
      key: 'tokenId',
      label: 'API-Token-ID',
      type: 'string',
      required: true,
      placeholder: 'kompass@pve!dashboard',
      help: 'Datacenter → Berechtigungen → API-Token. Format Benutzer@Realm!TokenName. Nur lesen: Rolle PVEAuditor auf „/“. Für Start/Stopp zusätzlich VM.PowerMgmt (z. B. PVEVMUser).',
    },
    { key: 'tokenSecret', label: 'API-Token-Secret', type: 'secret', required: true, placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' },
  ],
  headers: (c) => (c.tokenId ? { Authorization: `PVEAPIToken=${c.tokenId}=${c.tokenSecret ?? ''}` } : {}),
  defaultWidget: 'overview',

  async health(ctx) {
    await ctx.http.get('/api2/json/version');
  },

  widgets: {
    overview: {
      name: 'Übersicht',
      description: 'Nodes mit CPU/RAM, laufende VMs und Container',
      interval: 15,
      async fetch(ctx) {
        const o = overviewBlocks(await resources(ctx));
        return { summary: o.summary, status: o.status, blocks: o.blocks };
      },
      async detail(ctx) {
        return proxmoxDetail(ctx);
      },
    },
    guests: {
      name: 'VMs & Container',
      description: 'Status und Auslastung, mit Starten/Herunterfahren/Neustarten',
      interval: 15,
      options: [
        limitOption(8, 'Anzahl'),
        {
          key: 'kind',
          label: 'Anzeigen',
          type: 'select',
          default: 'all',
          options: [
            { value: 'all', label: 'VMs und Container' },
            { value: 'qemu', label: 'Nur VMs' },
            { value: 'lxc', label: 'Nur Container (LXC)' },
          ],
        },
        { key: 'runningFirst', label: 'Laufende zuerst', type: 'boolean', default: true },
      ],
      async fetch(ctx, o) {
        let guests = (await resources(ctx)).filter(isGuest);
        if (o.kind === 'qemu' || o.kind === 'lxc') guests = guests.filter((g) => g.type === o.kind);
        guests.sort((a, b) => (o.runningFirst !== false ? Number(b.status === 'running') - Number(a.status === 'running') : 0) || (a.vmid ?? 0) - (b.vmid ?? 0));
        const running = guests.filter((g) => g.status === 'running').length;
        return {
          summary: `${running} von ${guests.length} laufen`,
          blocks: [{ type: 'list', items: guests.slice(0, Number(o.limit) || 8).map((g) => guestItem(ctx, g)), empty: 'Keine VMs oder Container' }],
        };
      },
      async detail(ctx) {
        return proxmoxDetail(ctx);
      },
    },
  },

  async search(ctx, q) {
    const all = await resources(ctx);
    const out: SearchResult[] = [];
    for (const r of all) {
      if (isGuest(r)) {
        const score = Math.max(bestScore(q.text, r.name, `${kind(r)} ${r.vmid}`), String(r.vmid) === q.text.trim() ? 1 : 0);
        if (score < 0.6) continue;
        out.push({
          id: `pve:${r.id}`,
          title: r.name ?? `${kind(r)} ${r.vmid}`,
          subtitle: `Proxmox ${kind(r)} ${r.vmid} · ${r.node} · ${r.status === 'running' ? `läuft seit ${duration(r.uptime)}` : statusText(r.status)}`,
          group: `${ctx.service.name} · VMs & Container`,
          kind: 'container',
          url: ctx.link(`/#v1:0:=${r.type}%2F${r.vmid}`),
          score: score * 0.75,
          actions: guestActions(ctx, r),
        });
      } else if (r.type === 'node') {
        const score = bestScore(q.text, r.node);
        if (score < 0.7) continue;
        out.push({
          id: `pve:${r.id}`,
          title: r.node,
          subtitle: `Proxmox-Node · ${r.status === 'online' ? `CPU ${percent((r.cpu ?? 0) * 100, 0)} · RAM ${percent(pct(r.mem, r.maxmem), 0)}` : 'offline'}`,
          group: `${ctx.service.name} · VMs & Container`,
          kind: 'service',
          url: ctx.link(`/#v1:0:=node%2F${encodeURIComponent(r.node)}`),
          score: score * 0.7,
        });
      }
    }
    return out;
  },

  actions: {
    start: (ctx, p) => power(ctx, p, 'start', 'wird gestartet'),
    shutdown: (ctx, p) => power(ctx, p, 'shutdown', 'wird heruntergefahren'),
    stop: (ctx, p) => power(ctx, p, 'stop', 'wurde hart gestoppt'),
    reboot: (ctx, p) => power(ctx, p, 'reboot', 'wird neu gestartet'),
  },
});

/** Everything at once: nodes, all guests, storage. */
async function proxmoxDetail(ctx: Context) {
  const all = await resources(ctx, true);
  const o = overviewBlocks(all);
  const guests = all.filter(isGuest).sort((a, b) => Number(b.status === 'running') - Number(a.status === 'running') || (a.vmid ?? 0) - (b.vmid ?? 0));
  // shared storage shows up once per node – keep one entry
  const seen = new Set<string>();
  const storage = all
    .filter((r) => r.type === 'storage' && r.maxdisk)
    .filter((r) => {
      const key = r.shared ? r.storage! : `${r.node}/${r.storage}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => pct(b.disk, b.maxdisk) - pct(a.disk, a.maxdisk));
  return {
    summary: o.summary,
    status: o.status,
    blocks: [
      ...o.blocks,
      { type: 'heading' as const, text: `VMs & Container (${guests.length})` },
      { type: 'list' as const, items: guests.map((g) => guestItem(ctx, g)), empty: 'Keine VMs oder Container' },
      ...(storage.length
        ? [
            { type: 'heading' as const, text: 'Speicher' },
            {
              type: 'bars' as const,
              items: storage.map((s) => ({
                label: `${s.storage}${s.shared ? '' : ` · ${s.node}`}`,
                value: `${bytes(s.disk)} / ${bytes(s.maxdisk)}`,
                percent: pct(s.disk, s.maxdisk),
                tone: level(pct(s.disk, s.maxdisk)),
              })),
            },
          ]
        : []),
    ],
  };
}
