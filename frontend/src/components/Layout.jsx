import React from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { LayoutDashboard, Users2, UserCircle2, LogOut, Landmark } from "lucide-react";

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const navItems = [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, testid: "nav-dashboard" },
    { to: "/leads", label: "Leads", icon: Users2, testid: "nav-leads" },
    ...(user?.role === "admin" ? [{ to: "/partners", label: "Growth Partners", icon: UserCircle2, testid: "nav-partners" }] : []),
  ];

  const doLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-background">
      <aside className="w-64 fixed h-screen bg-brand-dark text-white flex flex-col z-40">
        <div className="h-16 flex items-center gap-2 px-5 border-b border-white/10">
          <div className="h-8 w-8 rounded-md bg-brand flex items-center justify-center">
            <Landmark className="h-5 w-5 text-white" />
          </div>
          <span className="text-lg font-heading font-bold">BankEzee<span className="text-brand-foreground/60"> CRM</span></span>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} data-testid={item.testid}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                  isActive ? "bg-brand text-white" : "text-white/70 hover:bg-white/5 hover:text-white"
                }`}>
              <item.icon size={20} />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-white/10">
          <div className="flex items-center gap-3 px-2 py-2 mb-1">
            <div className="h-9 w-9 rounded-full bg-brand/30 flex items-center justify-center text-sm font-semibold overflow-hidden">
              {user?.picture ? <img src={user.picture} alt="" className="h-full w-full object-cover" /> : (user?.name?.[0] || "U").toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate" data-testid="sidebar-user-name">{user?.name}</p>
              <p className="text-xs text-white/50 capitalize">{user?.role?.replace("_", " ")}</p>
            </div>
          </div>
          <button data-testid="logout-btn" onClick={doLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium text-white/70 hover:bg-white/5 hover:text-white transition-colors">
            <LogOut size={20} /> Logout
          </button>
        </div>
      </aside>
      <main className="ml-64 min-h-screen">
        <Outlet />
      </main>
    </div>
  );
}
