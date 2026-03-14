import { useState } from 'react';
import {
  Server, HardDrive, Database, Cloud, Shield, Network, Box,
  Cpu, MemoryStick, Globe, Hash, Lock, Tag, Users, Layers,
  AlertCircle, CheckCircle, Link, MapPin, Code,
} from 'lucide-react';
import { Resource } from '../api/resources';

interface Props {
  resource: Resource;
}

function Pill({ children, color = 'gray' }: { children: React.ReactNode; color?: string }) {
  const colors: Record<string, string> = {
    gray:   'bg-lnborder text-lnmuted',
    green:  'bg-lngreen/10 text-lngreen',
    red:    'bg-lnred/10 text-lnred',
    amber:  'bg-ln-icon-amber text-lnamber',
    blue:   'bg-ln-icon-blue text-lnblue',
    cyan:   'bg-ln-icon-cyan text-lncyan',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colors[color] ?? colors.gray}`}>
      {children}
    </span>
  );
}

function InfoRow({ icon: Icon, label, value, mono = false }: {
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="mt-0.5 w-4 h-4 flex-shrink-0 text-lnfaint">
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0">
        <div className="text-xs text-lnfaint mb-0.5">{label}</div>
        <div className={`text-sm text-lntext ${mono ? 'font-mono text-xs' : ''}`}>{value}</div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-semibold text-lnfaint uppercase tracking-wider mb-2">{title}</div>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}

function TagsList({ tags }: { tags: string[] }) {
  if (!tags?.length) return <span className="text-lnfaint text-sm">None</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map(t => <Pill key={t}>{t}</Pill>)}
    </div>
  );
}

function LinodeSpecs({ specs }: { specs: Record<string, unknown> }) {
  const vcpus = specs.vcpus as number;
  const memory = specs.memory as number;
  const disk = specs.disk as number;
  const backups = specs.backups_enabled as boolean;
  const encryption = specs.disk_encryption as string;
  const tags = specs.tags as string[];
  const image = specs.image as string;
  const type = specs.type as string;
  const hypervisor = specs.hypervisor as string;
  const ips = specs.ipv4 as string[];
  const ipv6 = specs.ipv6 as string;
  const firewalls = specs.firewall_labels as string[];

  return (
    <div className="grid grid-cols-2 gap-x-8 gap-y-4">
      <Section title="Compute">
        {vcpus != null && <InfoRow icon={Cpu} label="vCPUs" value={`${vcpus} core${vcpus !== 1 ? 's' : ''}`} />}
        {memory != null && <InfoRow icon={MemoryStick} label="RAM" value={`${(memory / 1024).toFixed(memory >= 1024 ? 0 : 1)} GB`} />}
        {disk != null && <InfoRow icon={HardDrive} label="Disk" value={`${(disk / 1024).toFixed(0)} GB`} />}
        {type && <InfoRow icon={Server} label="Plan" value={type} mono />}
        {hypervisor && <InfoRow icon={Box} label="Hypervisor" value={hypervisor} />}
        {image && <InfoRow icon={Layers} label="Image" value={image} mono />}
      </Section>

      <Section title="Network & Security">
        {ips?.length > 0 && (
          <InfoRow icon={Globe} label="IPv4" value={
            <div className="space-y-0.5">{ips.map(ip => <div key={ip} className="font-mono text-xs">{ip}</div>)}</div>
          } />
        )}
        {ipv6 && <InfoRow icon={Globe} label="IPv6" value={ipv6} mono />}
        {firewalls?.length > 0 && (
          <InfoRow icon={Shield} label="Firewalls" value={
            <div className="flex flex-wrap gap-1">{firewalls.map(f => <Pill key={f} color="red">{f}</Pill>)}</div>
          } />
        )}
        <InfoRow icon={HardDrive} label="Backups" value={
          backups ? <Pill color="green">Enabled</Pill> : <Pill color="amber">Disabled</Pill>
        } />
        <InfoRow icon={Lock} label="Disk Encryption" value={
          encryption === 'enabled' ? <Pill color="green">Enabled</Pill> : <Pill color="amber">{encryption ?? 'Disabled'}</Pill>
        } />
      </Section>

      {tags != null && (
        <div className="col-span-2">
          <Section title="Tags">
            <TagsList tags={tags} />
          </Section>
        </div>
      )}
    </div>
  );
}

function VolumeSpecs({ specs }: { specs: Record<string, unknown> }) {
  const size = specs.size as number;
  const linodeId = specs.linode_id as number | null;
  const linodeLabel = specs.linode_label as string;
  const mountPath = specs.filesystem_path as string;
  const encryption = specs.encryption as string;
  const tags = specs.tags as string[];

  return (
    <div className="grid grid-cols-2 gap-x-8 gap-y-4">
      <Section title="Storage">
        {size != null && <InfoRow icon={HardDrive} label="Size" value={`${size} GB`} />}
        {mountPath && <InfoRow icon={Link} label="Mount Path" value={mountPath} mono />}
        <InfoRow icon={Lock} label="Encryption" value={
          encryption === 'enabled' ? <Pill color="green">Enabled</Pill> : <Pill color="amber">{encryption ?? 'Disabled'}</Pill>
        } />
      </Section>

      <Section title="Attachment">
        {linodeId != null ? (
          <InfoRow icon={Server} label="Attached Linode" value={
            <div>
              <div className="font-mono text-xs">{linodeLabel || String(linodeId)}</div>
              {linodeLabel && <div className="text-lnfaint text-xs">ID: {linodeId}</div>}
            </div>
          } />
        ) : (
          <InfoRow icon={AlertCircle} label="Attached Linode" value={<Pill color="amber">Unattached</Pill>} />
        )}
      </Section>

      {tags != null && (
        <div className="col-span-2">
          <Section title="Tags"><TagsList tags={tags} /></Section>
        </div>
      )}
    </div>
  );
}

function FirewallSpecs({ specs }: { specs: Record<string, unknown> }) {
  const inbound = specs.inbound as Array<Record<string, unknown>>;
  const outbound = specs.outbound as Array<Record<string, unknown>>;
  const inboundPolicy = specs.inbound_policy as string;
  const outboundPolicy = specs.outbound_policy as string;
  const linodeIds = specs.linode_ids as number[];
  const linodeLabels = specs.linode_labels as string[];

  const policyPill = (p: string) =>
    p === 'DROP' ? <Pill color="green">DROP</Pill>
    : p === 'ACCEPT' ? <Pill color="amber">ACCEPT</Pill>
    : <Pill>{p}</Pill>;

  const ruleRow = (rule: Record<string, unknown>, i: number) => (
    <div key={i} className="flex items-center gap-2 flex-wrap py-1.5 border-b border-lnborder/50 last:border-0">
      <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${rule.action === 'ACCEPT' ? 'bg-ln-icon-amber text-lnamber' : 'bg-lngreen/10 text-lngreen'}`}>
        {rule.action as string}
      </span>
      <span className="text-xs font-mono text-lnmuted">{rule.protocol as string}</span>
      {rule.ports && <span className="text-xs font-mono text-lncyan2">:{rule.ports as string}</span>}
      {(rule.addresses as Record<string,unknown>)?.ipv4 && (
        <span className="text-xs text-lnmuted">
          from {((rule.addresses as Record<string,unknown>).ipv4 as string[]).join(', ')}
        </span>
      )}
      {rule.label && <span className="text-xs text-lnfaint ml-auto truncate max-w-[160px]">{rule.label as string}</span>}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-x-8">
        <Section title="Default Policies">
          {inboundPolicy && <InfoRow icon={Shield} label="Inbound" value={policyPill(inboundPolicy)} />}
          {outboundPolicy && <InfoRow icon={Shield} label="Outbound" value={policyPill(outboundPolicy)} />}
        </Section>
        <Section title="Attached Linodes">
          {linodeIds?.length > 0 ? (
            <div className="space-y-1">
              {(linodeLabels ?? linodeIds.map(String)).map((l, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <Server className="w-3.5 h-3.5 text-lnfaint" />
                  <span className="text-sm text-lntext">{l}</span>
                </div>
              ))}
            </div>
          ) : <span className="text-lnfaint text-sm">None attached</span>}
        </Section>
      </div>

      {inbound?.length > 0 && (
        <Section title={`Inbound Rules (${inbound.length})`}>
          <div className="bg-lndark rounded px-3 py-1">
            {inbound.map((r, i) => ruleRow(r, i))}
          </div>
        </Section>
      )}

      {outbound?.length > 0 && (
        <Section title={`Outbound Rules (${outbound.length})`}>
          <div className="bg-lndark rounded px-3 py-1">
            {outbound.map((r, i) => ruleRow(r, i))}
          </div>
        </Section>
      )}
    </div>
  );
}

function DatabaseSpecs({ specs }: { specs: Record<string, unknown> }) {
  const engine = specs.engine as string;
  const version = specs.version as string;
  const clusterSize = specs.cluster_size as number;
  const type = specs.type as string;
  const publicAccess = specs.allow_public_access as boolean;
  const port = specs.port as number;
  const allowList = specs.allow_list as string[];
  const encrypted = specs.encrypted as boolean;
  const totalDisk = specs.total_disk_size_gb as number;
  const usedDisk = specs.used_disk_size_gb as number;
  const hosts = specs.hosts as Record<string, string>;
  const tags = specs.tags as string[];

  return (
    <div className="grid grid-cols-2 gap-x-8 gap-y-4">
      <Section title="Engine">
        {engine && <InfoRow icon={Database} label="Engine" value={`${engine}${version ? ` ${version}` : ''}`} />}
        {type && <InfoRow icon={Server} label="Plan" value={type} mono />}
        {clusterSize != null && <InfoRow icon={Layers} label="Cluster Size" value={`${clusterSize} node${clusterSize !== 1 ? 's' : ''}`} />}
        {port != null && <InfoRow icon={Hash} label="Port" value={String(port)} mono />}
      </Section>

      <Section title="Access & Security">
        <InfoRow icon={Globe} label="Public Access" value={
          publicAccess ? <Pill color="red">Enabled</Pill> : <Pill color="green">Disabled</Pill>
        } />
        <InfoRow icon={Lock} label="Encryption" value={
          encrypted ? <Pill color="green">Enabled</Pill> : <Pill color="amber">Disabled</Pill>
        } />
        {allowList?.length > 0 && (
          <InfoRow icon={Shield} label="IP Allow List" value={
            <div className="space-y-0.5">{allowList.map(ip => <div key={ip} className="font-mono text-xs text-lnmuted">{ip}</div>)}</div>
          } />
        )}
      </Section>

      {hosts && (
        <Section title="Hosts">
          {hosts.primary && <InfoRow icon={Globe} label="Primary" value={hosts.primary} mono />}
          {hosts.secondary && <InfoRow icon={Globe} label="Secondary" value={hosts.secondary} mono />}
        </Section>
      )}

      <Section title="Storage">
        {totalDisk != null && <InfoRow icon={HardDrive} label="Total Disk" value={`${totalDisk} GB`} />}
        {usedDisk != null && <InfoRow icon={HardDrive} label="Used Disk" value={`${usedDisk} GB`} />}
      </Section>

      {tags != null && (
        <div className="col-span-2">
          <Section title="Tags"><TagsList tags={tags} /></Section>
        </div>
      )}
    </div>
  );
}

function ObjectStorageSpecs({ specs }: { specs: Record<string, unknown> }) {
  const objects = specs.objects as number;
  const bytes = specs.bytes as number;
  const acl = specs.acl as string;
  const corsEnabled = specs.cors_enabled as boolean;
  const hostname = specs.hostname as string;

  const aclColor = (a: string) =>
    a === 'private' ? 'green'
    : a === 'public-read' ? 'red'
    : a === 'public-read-write' ? 'red'
    : 'amber';

  const formatBytes = (b: number) => {
    if (b == null) return null;
    if (b >= 1e9) return `${(b / 1e9).toFixed(2)} GB`;
    if (b >= 1e6) return `${(b / 1e6).toFixed(2)} MB`;
    if (b >= 1e3) return `${(b / 1e3).toFixed(2)} KB`;
    return `${b} B`;
  };

  return (
    <div className="grid grid-cols-2 gap-x-8 gap-y-4">
      <Section title="Contents">
        {objects != null && <InfoRow icon={Box} label="Objects" value={objects.toLocaleString()} />}
        {bytes != null && <InfoRow icon={HardDrive} label="Size" value={formatBytes(bytes) ?? '—'} />}
      </Section>

      <Section title="Access">
        {acl && <InfoRow icon={Lock} label="ACL" value={<Pill color={aclColor(acl)}>{acl}</Pill>} />}
        <InfoRow icon={Globe} label="CORS" value={
          corsEnabled ? <Pill color="amber">Enabled</Pill> : <Pill color="green">Disabled</Pill>
        } />
        {hostname && <InfoRow icon={Globe} label="Hostname" value={hostname} mono />}
      </Section>
    </div>
  );
}

function LKESpecs({ specs }: { specs: Record<string, unknown> }) {
  const k8sVersion = specs.k8s_version as string;
  const ha = specs.control_plane_ha as boolean;
  const nodePools = specs.node_pools as Array<Record<string, unknown>>;
  const tags = specs.tags as string[];
  const acl = specs.control_plane_acl as Record<string, unknown>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-x-8">
        <Section title="Cluster">
          {k8sVersion && <InfoRow icon={Box} label="Kubernetes" value={k8sVersion} />}
          <InfoRow icon={Shield} label="Control Plane HA" value={
            ha ? <Pill color="green">Enabled</Pill> : <Pill color="amber">Disabled</Pill>
          } />
          {acl != null && (
            <InfoRow icon={Lock} label="Control Plane ACL" value={
              (acl as Record<string, unknown>)?.enabled
                ? <Pill color="green">Enabled</Pill>
                : <Pill color="amber">Disabled</Pill>
            } />
          )}
        </Section>

        {tags != null && (
          <Section title="Tags">
            <TagsList tags={tags} />
          </Section>
        )}
      </div>

      {nodePools?.length > 0 && (
        <Section title={`Node Pools (${nodePools.length})`}>
          <div className="space-y-2">
            {nodePools.map((pool, i) => (
              <div key={i} className="bg-lndark rounded px-4 py-3 flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <Server className="w-4 h-4 text-lnfaint" />
                  <span className="text-sm text-lntext font-mono">{pool.type as string}</span>
                </div>
                <div className="flex items-center gap-2 text-lnmuted">
                  <Users className="w-3.5 h-3.5" />
                  <span className="text-sm">{pool.count as number} node{(pool.count as number) !== 1 ? 's' : ''}</span>
                </div>
                {pool.autoscaler && (pool.autoscaler as Record<string,unknown>).enabled && (
                  <Pill color="blue">Autoscale {(pool.autoscaler as Record<string,unknown>).min}–{(pool.autoscaler as Record<string,unknown>).max}</Pill>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function NodeBalancerSpecs({ specs }: { specs: Record<string, unknown> }) {
  const configs = specs.configs as Array<Record<string, unknown>>;
  const tags = specs.tags as string[];
  const hostname = specs.hostname as string;
  const ipv4 = specs.ipv4 as string;
  const ipv6 = specs.ipv6 as string;

  const protoColor = (p: string) =>
    p === 'https' ? 'green' : p === 'http' ? 'amber' : 'gray';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-x-8">
        <Section title="Network">
          {hostname && <InfoRow icon={Globe} label="Hostname" value={hostname} mono />}
          {ipv4 && <InfoRow icon={Globe} label="IPv4" value={ipv4} mono />}
          {ipv6 && <InfoRow icon={Globe} label="IPv6" value={ipv6} mono />}
        </Section>
        {tags != null && (
          <Section title="Tags"><TagsList tags={tags} /></Section>
        )}
      </div>

      {configs?.length > 0 && (
        <Section title={`Port Configurations (${configs.length})`}>
          <div className="space-y-2">
            {configs.map((cfg, i) => (
              <div key={i} className="bg-lndark rounded px-4 py-3 flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <Hash className="w-3.5 h-3.5 text-lnfaint" />
                  <span className="text-sm text-lntext font-semibold">:{cfg.port as number}</span>
                </div>
                <Pill color={protoColor(cfg.protocol as string)}>{(cfg.protocol as string)?.toUpperCase()}</Pill>
                {cfg.algorithm && <span className="text-xs text-lnmuted">algo: {cfg.algorithm as string}</span>}
                {cfg.nodes_status && (
                  <span className="text-xs text-lnmuted ml-auto">
                    {(cfg.nodes_status as Record<string,number>).up ?? 0} up / {(cfg.nodes_status as Record<string,number>).down ?? 0} down
                  </span>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function VPCSpecs({ specs }: { specs: Record<string, unknown> }) {
  const subnets = specs.subnets as Array<Record<string, unknown>>;
  const linodeCount = specs.linode_count as number;
  const description = specs.description as string;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-x-8">
        <Section title="Overview">
          {linodeCount != null && <InfoRow icon={Server} label="Linodes" value={linodeCount} />}
          {specs.subnet_count != null && <InfoRow icon={Network} label="Subnets" value={specs.subnet_count as number} />}
          {description && <InfoRow icon={Tag} label="Description" value={description} />}
        </Section>
      </div>

      {subnets?.length > 0 && (
        <Section title={`Subnets (${subnets.length})`}>
          <div className="space-y-2">
            {subnets.map((s, i) => (
              <div key={i} className="bg-lndark rounded px-4 py-3 flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <Network className="w-3.5 h-3.5 text-lnfaint" />
                  <span className="text-sm text-lntext font-medium">{s.label as string}</span>
                </div>
                <span className="text-xs font-mono text-lncyan2">{s.ipv4 as string}</span>
                <div className="flex items-center gap-1.5 text-lnmuted ml-auto">
                  <Server className="w-3.5 h-3.5" />
                  <span className="text-xs">{s.linode_count as number} Linode{(s.linode_count as number) !== 1 ? 's' : ''}</span>
                </div>
                <span className="text-xs text-lnfaint font-mono">ID: {s.id as number}</span>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function GenericSpecs({ specs }: { specs: Record<string, unknown> }) {
  const entries = Object.entries(specs).filter(([, v]) => v != null && v !== '' && !(Array.isArray(v) && v.length === 0));

  const renderValue = (v: unknown): React.ReactNode => {
    if (typeof v === 'boolean') return v ? <Pill color="green">true</Pill> : <Pill color="amber">false</Pill>;
    if (Array.isArray(v)) {
      if (v.length === 0) return <span className="text-lnfaint">—</span>;
      if (typeof v[0] === 'string' || typeof v[0] === 'number') {
        return <div className="flex flex-wrap gap-1">{v.map((item, i) => <Pill key={i}>{String(item)}</Pill>)}</div>;
      }
      return <pre className="text-xs text-lnmuted bg-lndark rounded p-2 overflow-auto max-h-32">{JSON.stringify(v, null, 2)}</pre>;
    }
    if (typeof v === 'object' && v !== null) {
      return <pre className="text-xs text-lnmuted bg-lndark rounded p-2 overflow-auto max-h-32">{JSON.stringify(v, null, 2)}</pre>;
    }
    return <span className={typeof v === 'number' ? 'font-mono' : ''}>{String(v)}</span>;
  };

  return (
    <div className="grid grid-cols-2 gap-x-8 gap-y-3">
      {entries.map(([key, value]) => (
        <div key={key} className={typeof value === 'object' && !Array.isArray(value) ? 'col-span-2' : ''}>
          <InfoRow
            icon={Tag}
            label={key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
            value={renderValue(value)}
          />
        </div>
      ))}
    </div>
  );
}

export default function ResourceSpecsView({ resource }: Props) {
  const [showJson, setShowJson] = useState(false);
  const { specs, resource_type } = resource;

  if (!specs || Object.keys(specs).length === 0) {
    return <p className="text-lnfaint text-sm">No spec data available.</p>;
  }

  const renderRich = () => {
    switch (resource_type) {
      case 'linode':        return <LinodeSpecs specs={specs} />;
      case 'volume':        return <VolumeSpecs specs={specs} />;
      case 'firewall':      return <FirewallSpecs specs={specs} />;
      case 'database':      return <DatabaseSpecs specs={specs} />;
      case 'object_storage':return <ObjectStorageSpecs specs={specs} />;
      case 'lke_cluster':   return <LKESpecs specs={specs} />;
      case 'nodebalancer':  return <NodeBalancerSpecs specs={specs} />;
      case 'vpc':           return <VPCSpecs specs={specs} />;
      default:              return <GenericSpecs specs={specs} />;
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-lnfaint uppercase tracking-wider flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5" />
          Specifications
        </span>
        <button
          onClick={() => setShowJson(v => !v)}
          className="flex items-center gap-1.5 text-xs text-lnfaint hover:text-lnmuted transition-colors px-2 py-1 rounded hover:bg-lnborder"
        >
          <Code className="w-3.5 h-3.5" />
          {showJson ? 'Rich View' : 'JSON'}
        </button>
      </div>

      {showJson ? (
        <pre className="text-xs text-lnmuted bg-lndark rounded p-3 overflow-auto max-h-64 whitespace-pre-wrap leading-relaxed">
          {JSON.stringify(specs, null, 2)}
        </pre>
      ) : (
        <div className="bg-lndark/50 rounded p-4">
          {renderRich()}
        </div>
      )}
    </div>
  );
}
