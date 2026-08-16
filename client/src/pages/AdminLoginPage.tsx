import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import Footer from "../components/Footer";
import { fetchJson, setAdminPassword } from "../services/api";

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");

    try {
      setAdminPassword(password);
      await fetchJson("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      sessionStorage.setItem("quizbattle-admin-pw", password);
      navigate("/admin");
    } catch (err) {
      setAdminPassword("");
      setError(err instanceof Error ? err.message : "Invalid admin password");
    }
  };

  return (
    <div className="app-shell">
      <div className="card" style={{ maxWidth: 420, margin: "70px auto" }}>
        <h2 style={{ marginTop: 0 }}>Admin Login</h2>
        <form onSubmit={handleSubmit} className="form-grid">
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter the password"
            />
          </label>
          {error && (
            <div style={{ color: "#fca5a5", fontWeight: 700 }}>{error}</div>
          )}
          <button type="submit" className="primary">
            LOGIN
          </button>
        </form>
      </div>
      <Footer />
    </div>
  );
}
