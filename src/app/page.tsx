import { redirect } from "next/navigation";

export default function HomePage() {
  // El middleware raíz ya asegura que sólo lleguen aquí usuarios autenticados;
  // si no lo están, los redirige a /login. Desde "/" siempre al dashboard.
  redirect("/dashboard");
}
