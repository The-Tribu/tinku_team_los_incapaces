"use client";
import { useState } from "react";
import {
  Loader2,
  Plus,
  Search,
  Shield,
  Trash2,
  UserCheck,
  UserCog,
  UserRound,
  UserX,
} from "lucide-react";
import type { Role } from "@/lib/auth";

type Row = {
  id: string;
  email: string;
  name: string;
  role: string;
  active: boolean;
  createdAt: string;
  lastLoginAt: string | null;
};

const ROLES: { value: Role; label: string; icon: React.ReactNode; hint: string }[] = [
  { value: "admin", label: "Administrador", icon: <Shield className="h-3.5 w-3.5" />, hint: "Acceso total + gestión de usuarios" },
  { value: "ops", label: "Operaciones", icon: <UserCog className="h-3.5 w-3.5" />, hint: "Lectura + acciones (alarmas, predicción, onboarding)" },
  { value: "viewer", label: "Lectura", icon: <UserRound className="h-3.5 w-3.5" />, hint: "Solo lectura del sistema" },
];

export function UsersConsole({
  initialUsers,
  currentUserId,
}: {
  initialUsers: Row[];
  currentUserId: string;
}) {
  const [users, setUsers] = useState<Row[]>(initialUsers);
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);

  const filtered = users.filter((u) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.role.includes(q);
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre, email o rol…"
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
          />
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
        >
          <Plus className="h-4 w-4" />
          {showForm ? "Ocultar formulario" : "Nuevo usuario"}
        </button>
      </div>

      {showForm ? (
        <CreateUserForm
          onCreated={(u) => {
            setUsers([u, ...users]);
            setShowForm(false);
          }}
        />
      ) : null}

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs uppercase text-slate-500">
              <th className="px-5 py-3 font-medium">Usuario</th>
              <th className="px-5 py-3 font-medium">Rol</th>
              <th className="px-5 py-3 font-medium">Estado</th>
              <th className="px-5 py-3 font-medium">Último ingreso</th>
              <th className="px-5 py-3 text-right font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-12 text-center text-sm text-slate-500">
                  {users.length === 0
                    ? "Aún no hay usuarios. Crea el primero ↑"
                    : "Sin resultados para esa búsqueda."}
                </td>
              </tr>
            ) : (
              filtered.map((u) => (
                <UserRow
                  key={u.id}
                  user={u}
                  isSelf={u.id === currentUserId}
                  onChanged={(updated) =>
                    setUsers((curr) => curr.map((x) => (x.id === updated.id ? updated : x)))
                  }
                  onDeleted={(id) => setUsers((curr) => curr.filter((x) => x.id !== id))}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CreateUserForm({ onCreated }: { onCreated: (u: Row) => void }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("viewer");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name, password, role }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "No se pudo crear el usuario");
      onCreated({ ...json.user, lastLoginAt: null });
      setEmail("");
      setName("");
      setPassword("");
      setRole("viewer");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <h2 className="font-heading text-base font-semibold">Nuevo usuario</h2>
      <p className="mt-1 text-xs text-slate-500">
        Crea la cuenta y comparte la contraseña temporal al titular para que la cambie después.
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <label className="block text-xs font-medium uppercase text-slate-500">Nombre</label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
            placeholder="Ana Gómez"
          />
        </div>
        <div>
          <label className="block text-xs font-medium uppercase text-slate-500">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
            placeholder="ana@empresa.co"
          />
        </div>
        <div>
          <label className="block text-xs font-medium uppercase text-slate-500">
            Contraseña temporal
          </label>
          <input
            type="text"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
            placeholder="Mín. 8 caracteres"
          />
        </div>
        <div>
          <label className="block text-xs font-medium uppercase text-slate-500">Rol</label>
          <div className="mt-1 grid grid-cols-3 gap-2">
            {ROLES.map((r) => (
              <button
                type="button"
                key={r.value}
                onClick={() => setRole(r.value)}
                className={`flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-medium transition ${
                  role === r.value
                    ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                }`}
              >
                {r.icon}
                {r.label}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            {ROLES.find((r) => r.value === role)?.hint}
          </p>
        </div>
      </div>
      {error ? (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}
      <div className="mt-4 flex justify-end">
        <button
          type="submit"
          disabled={busy}
          className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          {busy ? "Creando…" : "Crear usuario"}
        </button>
      </div>
    </form>
  );
}

function UserRow({
  user,
  isSelf,
  onChanged,
  onDeleted,
}: {
  user: Row;
  isSelf: boolean;
  onChanged: (u: Row) => void;
  onDeleted: (id: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  async function updateRole(role: Role) {
    setBusy("role");
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "No se pudo actualizar");
      onChanged({ ...user, ...json.user });
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function toggleActive() {
    setBusy("active");
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !user.active }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "No se pudo actualizar");
      onChanged({ ...user, ...json.user });
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!confirm(`¿Eliminar a ${user.name}? Esta acción no se puede deshacer.`)) return;
    setBusy("delete");
    try {
      const res = await fetch(`/api/users/${user.id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "No se pudo eliminar");
      onDeleted(user.id);
    } catch (err) {
      alert((err as Error).message);
      setBusy(null);
    }
  }

  const roleMeta = ROLES.find((r) => r.value === user.role);

  return (
    <tr className="border-t border-slate-100">
      <td className="px-5 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-700">
            {user.name.split(" ").map((s) => s[0]).join("").slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="text-sm font-medium text-slate-900">
              {user.name}
              {isSelf ? <span className="ml-2 text-[10px] text-emerald-600">(tú)</span> : null}
            </div>
            <div className="text-xs text-slate-500">{user.email}</div>
          </div>
        </div>
      </td>
      <td className="px-5 py-3">
        <select
          value={user.role}
          disabled={isSelf || busy !== null}
          onChange={(e) => void updateRole(e.target.value as Role)}
          className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 disabled:opacity-50"
          title={isSelf ? "No puedes cambiar tu propio rol" : ""}
        >
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        {roleMeta ? <div className="mt-1 text-[10px] text-slate-400">{roleMeta.hint}</div> : null}
      </td>
      <td className="px-5 py-3">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${
            user.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${user.active ? "bg-emerald-500" : "bg-slate-400"}`} />
          {user.active ? "Activo" : "Inactivo"}
        </span>
      </td>
      <td className="px-5 py-3 text-xs text-slate-500">
        {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString("es-CO") : "Nunca"}
      </td>
      <td className="px-5 py-3">
        <div className="flex justify-end gap-1">
          <button
            onClick={() => void toggleActive()}
            disabled={isSelf || busy !== null}
            title={isSelf ? "No puedes desactivarte a ti mismo" : user.active ? "Desactivar" : "Activar"}
            className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 transition hover:bg-slate-50 disabled:opacity-40"
          >
            {user.active ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
          </button>
          <button
            onClick={() => void remove()}
            disabled={isSelf || busy !== null}
            title={isSelf ? "No puedes eliminarte a ti mismo" : "Eliminar"}
            className="rounded-lg border border-red-200 bg-white p-1.5 text-red-500 transition hover:bg-red-50 disabled:opacity-40"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}
