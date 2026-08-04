import { LoginForm } from "../../components/login-form";

export default function LoginPage() {
  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="login-heading">
        <p className="eyebrow">Private workspace</p>
        <h1 id="login-heading">Sign in to OpsWeave</h1>
        <p className="lede">
          Use the owner credentials created with the local bootstrap command. There are no default
          credentials or web registration route.
        </p>
        <LoginForm />
      </section>
    </main>
  );
}
