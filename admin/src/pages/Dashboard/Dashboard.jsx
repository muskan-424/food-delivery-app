import React, { useState, useEffect, useContext } from "react";
import "./Dashboard.css";
import axios from "axios";
import { StoreContext } from "../../context/StoreContext";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { assets } from "../../assets/assets";
import { formatCurrency } from "../../utils/currency";

const Dashboard = ({ url }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const initialSearchParams = new URLSearchParams(location.search);
  const initialAuditPage = Math.max(1, Number(initialSearchParams.get("auditPage")) || 1);
  const initialAuditClientId = String(initialSearchParams.get("auditClientId") || "");
  const initialAuditFrom = String(initialSearchParams.get("auditFrom") || "");
  const initialAuditTo = String(initialSearchParams.get("auditTo") || "");
  const initialAuditStatusClass = String(initialSearchParams.get("auditStatusClass") || "");
  const { token, admin } = useContext(StoreContext);
  const [stats, setStats] = useState({
    totalOrders: 0,
    pendingOrders: 0,
    preparingOrders: 0,
    outForDelivery: 0,
    deliveredOrders: 0,
    totalRevenue: 0,
    totalFoodItems: 0,
    scheduledUpcoming: 0,
    scheduledDue: 0,
    scheduledOverdue: 0,
  });
  const [growthStats, setGrowthStats] = useState({
    referralUsers: 0,
    referredUsers: 0,
    loyaltyUsers: 0,
    campaignRuns30d: 0,
    dynamicPricedOrders30d: 0,
  });
  const [recentOrders, setRecentOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [retentionBusy, setRetentionBusy] = useState(false);
  const [retentionResult, setRetentionResult] = useState(null);
  const [retentionLastRun, setRetentionLastRun] = useState(null);
  const [experiments, setExperiments] = useState([]);
  const [experimentBusy, setExperimentBusy] = useState(false);
  const [selectedExperimentKey, setSelectedExperimentKey] = useState("");
  const [experimentResults, setExperimentResults] = useState(null);
  const [assignmentPreviewUserId, setAssignmentPreviewUserId] = useState("");
  const [assignmentPreviewResult, setAssignmentPreviewResult] = useState(null);
  const [partnerClients, setPartnerClients] = useState([]);
  const [partnerScopeCatalog, setPartnerScopeCatalog] = useState([]);
  const [partnerSelectedScopes, setPartnerSelectedScopes] = useState(["orders.read"]);
  const [partnerAuditRows, setPartnerAuditRows] = useState([]);
  const [partnerAuditPage, setPartnerAuditPage] = useState(initialAuditPage);
  const [partnerAuditTotalPages, setPartnerAuditTotalPages] = useState(1);
  const [partnerAuditTotal, setPartnerAuditTotal] = useState(0);
  const [partnerAuditAutoRefresh, setPartnerAuditAutoRefresh] = useState(false);
  const [partnerAuditExporting, setPartnerAuditExporting] = useState(false);
  const [partnerAuditTabVisible, setPartnerAuditTabVisible] = useState(
    typeof document === "undefined" ? true : !document.hidden
  );
  const [partnerAuditFilterClientId, setPartnerAuditFilterClientId] = useState(initialAuditClientId);
  const [partnerAuditFrom, setPartnerAuditFrom] = useState(initialAuditFrom);
  const [partnerAuditTo, setPartnerAuditTo] = useState(initialAuditTo);
  const [partnerAuditStatusClass, setPartnerAuditStatusClass] = useState(
    ["2xx", "4xx", "5xx"].includes(initialAuditStatusClass) ? initialAuditStatusClass : ""
  );
  const [partnerBusy, setPartnerBusy] = useState(false);
  const [newPartnerSecret, setNewPartnerSecret] = useState(null);
  const [partnerScopeError, setPartnerScopeError] = useState("");
  const [partnerForm, setPartnerForm] = useState({
    name: "",
  });
  const [experimentForm, setExperimentForm] = useState({
    key: "",
    name: "",
    variantsText: "control:50\ntreatment:50",
    audienceTagsText: "",
    audienceMode: "any",
    startAt: "",
    endAt: "",
  });

  useEffect(() => {
    if (!admin && !token) {
      toast.error("Please Login First");
      navigate("/");
    } else {
      fetchDashboardData();
    }
  }, [token, admin]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (partnerAuditPage > 1) params.set("auditPage", String(partnerAuditPage));
    else params.delete("auditPage");
    if (partnerAuditFilterClientId.trim()) params.set("auditClientId", partnerAuditFilterClientId.trim());
    else params.delete("auditClientId");
    if (partnerAuditFrom) params.set("auditFrom", partnerAuditFrom);
    else params.delete("auditFrom");
    if (partnerAuditTo) params.set("auditTo", partnerAuditTo);
    else params.delete("auditTo");
    if (partnerAuditStatusClass) params.set("auditStatusClass", partnerAuditStatusClass);
    else params.delete("auditStatusClass");
    const next = params.toString();
    const current = String(location.search || "").replace(/^\?/, "");
    if (next !== current) {
      navigate({ search: next ? `?${next}` : "" }, { replace: true });
    }
  }, [
    partnerAuditPage,
    partnerAuditFilterClientId,
    partnerAuditFrom,
    partnerAuditTo,
    partnerAuditStatusClass,
    navigate,
    location.search,
  ]);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      
      // Fetch orders
      const ordersResponse = await axios.get(url + "/api/order/list", {
        headers: { token }
      });
      const scheduledSummaryResponse = await axios.get(
        url + "/api/order/scheduled/summary",
        { headers: { token } }
      );
      const adminStatsResponse = await axios.get(
        url + "/api/admin/users/dashboard/stats",
        { headers: { token } }
      );
      const retentionLastRunResponse = await axios.get(
        `${url}/api/gdpr/admin/retention/last-run`,
        { headers: { token } }
      );
      const experimentsResponse = await axios.get(
        `${url}/api/admin/users/experiments`,
        { headers: { token } }
      );
      const partnerClientsResponse = await axios.get(
        `${url}/api/admin/users/partner-clients`,
        { headers: { token } }
      );
      const partnerAuditResponse = await axios.get(`${url}/api/admin/users/partner-api/audit`, {
        headers: { token },
        params: {
          page: initialAuditPage,
          limit: 20,
          clientId: initialAuditClientId.trim() || undefined,
          from: initialAuditFrom ? new Date(initialAuditFrom).toISOString() : undefined,
          to: initialAuditTo ? new Date(initialAuditTo).toISOString() : undefined,
          statusClass: initialAuditStatusClass || undefined,
        },
      });
      const partnerScopesResponse = await axios.get(`${url}/api/partner/scopes`);

      // Fetch food items
      const foodResponse = await axios.get(url + "/api/food/list");

      if (ordersResponse.data.success && foodResponse.data.success) {
        const orders = ordersResponse.data.data || [];
        const foodItems = foodResponse.data.data || [];
        const scheduledCounts = scheduledSummaryResponse.data?.data?.counts || {};

        // Calculate statistics
        const totalOrders = orders.length;
        const pendingOrders = orders.filter(o => o.status === 'pending' || o.status === 'confirmed').length;
        const preparingOrders = orders.filter(o => o.status === 'preparing').length;
        const outForDelivery = orders.filter(o => o.status === 'out_for_delivery').length;
        const deliveredOrders = orders.filter(o => o.status === 'delivered').length;
        
        const totalRevenue = orders
          .filter(o => o.status === 'delivered')
          .reduce((sum, order) => sum + (order.finalAmount || order.amount || 0), 0);

        setStats({
          totalOrders,
          pendingOrders,
          preparingOrders,
          outForDelivery,
          deliveredOrders,
          totalRevenue,
          totalFoodItems: foodItems.length,
          scheduledUpcoming: scheduledCounts.upcoming || 0,
          scheduledDue: scheduledCounts.due || 0,
          scheduledOverdue: scheduledCounts.overdue || 0,
        });
        const growth = adminStatsResponse.data?.data?.growth || {};
        setGrowthStats({
          referralUsers: growth?.referrals?.usersWithReferralCode || 0,
          referredUsers: growth?.referrals?.referredUsers || 0,
          loyaltyUsers: growth?.loyalty?.usersWithPoints || 0,
          campaignRuns30d: growth?.campaigns?.runsIn30d || 0,
          dynamicPricedOrders30d: growth?.dynamicPricing?.pricedOrdersIn30d || 0,
        });

        // Get recent 5 orders
        const recent = orders
          .sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt))
          .slice(0, 5);
        setRecentOrders(recent);
      }
      if (retentionLastRunResponse.data?.success) {
        setRetentionLastRun(retentionLastRunResponse.data?.data || null);
      }
      if (experimentsResponse.data?.success) {
        setExperiments(experimentsResponse.data?.data || []);
      }
      if (partnerClientsResponse.data?.success) {
        setPartnerClients(partnerClientsResponse.data?.data || []);
      }
      if (partnerAuditResponse.data?.success) {
        setPartnerAuditRows(partnerAuditResponse.data?.data || []);
        const pg = partnerAuditResponse.data?.pagination || {};
        setPartnerAuditPage(pg.page || 1);
        setPartnerAuditTotalPages(pg.totalPages || 1);
        setPartnerAuditTotal(pg.total || 0);
      }
      if (partnerScopesResponse.data?.success) {
        const scopes = partnerScopesResponse.data?.data?.scopes || [];
        setPartnerScopeCatalog(scopes);
        if (scopes.length > 0) {
          setPartnerSelectedScopes((prev) =>
            prev.length > 0 ? prev : [scopes[0].key]
          );
        }
      }
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
      toast.error("Error loading dashboard data");
    } finally {
      setLoading(false);
    }
  };

  const formatStatus = (status) => {
    const statusMap = {
      "pending": "Pending",
      "confirmed": "Confirmed",
      "preparing": "Preparing",
      "ready": "Ready",
      "out_for_delivery": "Out for Delivery",
      "delivered": "Delivered",
      "cancelled": "Cancelled"
    };
    return statusMap[status?.toLowerCase()] || status || "Unknown";
  };

  const getStatusColor = (status) => {
    const colors = {
      "pending": "#9E9E9E",
      "confirmed": "#4CAF50",
      "preparing": "#FF9800",
      "ready": "#FFC107",
      "out_for_delivery": "#2196F3",
      "delivered": "#4CAF50",
      "cancelled": "#F44336"
    };
    return colors[status?.toLowerCase()] || "#757575";
  };

  const runRetentionNow = async (dryRun) => {
    try {
      setRetentionBusy(true);
      const response = await axios.post(
        `${url}/api/gdpr/admin/retention/run`,
        { dryRun },
        { headers: { token } }
      );
      if (response.data?.success) {
        setRetentionResult(response.data?.data || null);
        const lastRunRes = await axios.get(`${url}/api/gdpr/admin/retention/last-run`, {
          headers: { token },
        });
        if (lastRunRes.data?.success) {
          setRetentionLastRun(lastRunRes.data?.data || null);
        }
        toast.success(dryRun ? "Retention dry-run completed" : "Retention cleanup completed");
      } else {
        toast.error(response.data?.message || "Retention run failed");
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Retention run failed");
    } finally {
      setRetentionBusy(false);
    }
  };

  const parseVariantsText = (raw) => {
    const lines = String(raw || "").split("\n");
    const rows = lines
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const parts = line.split(":");
        const key = String(parts[0] || "").trim().toLowerCase();
        const weight = Number(parts[1]);
        return { key, weight };
      })
      .filter((row) => row.key && Number.isFinite(row.weight) && row.weight > 0);
    return rows;
  };

  const createExperiment = async () => {
    try {
      const key = experimentForm.key.trim().toLowerCase();
      const name = experimentForm.name.trim();
      const variants = parseVariantsText(experimentForm.variantsText);
      const audienceTags = String(experimentForm.audienceTagsText || "")
        .split(",")
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean);
      const audienceMode = experimentForm.audienceMode === "all" ? "all" : "any";
      const startAt = experimentForm.startAt ? new Date(experimentForm.startAt).toISOString() : "";
      const endAt = experimentForm.endAt ? new Date(experimentForm.endAt).toISOString() : "";
      if (experimentForm.startAt && Number.isNaN(new Date(experimentForm.startAt).getTime())) {
        toast.error("Invalid start time");
        return;
      }
      if (experimentForm.endAt && Number.isNaN(new Date(experimentForm.endAt).getTime())) {
        toast.error("Invalid end time");
        return;
      }
      if (startAt && endAt && new Date(startAt) > new Date(endAt)) {
        toast.error("Start time must be before end time");
        return;
      }
      if (!key || !name || variants.length < 2) {
        toast.error("Provide key, name, and at least 2 variants (key:weight)");
        return;
      }
      setExperimentBusy(true);
      const response = await axios.post(
        `${url}/api/admin/users/experiments`,
        { key, name, variants, audienceTags, audienceMode, startAt, endAt, status: "draft" },
        { headers: { token } }
      );
      if (response.data?.success) {
        toast.success("Experiment created");
        setExperimentForm((prev) => ({
          ...prev,
          key: "",
          name: "",
          audienceTagsText: "",
          audienceMode: "any",
          startAt: "",
          endAt: "",
        }));
        const reload = await axios.get(`${url}/api/admin/users/experiments`, {
          headers: { token },
        });
        if (reload.data?.success) setExperiments(reload.data.data || []);
      } else {
        toast.error(response.data?.message || "Failed to create experiment");
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to create experiment");
    } finally {
      setExperimentBusy(false);
    }
  };

  const setExperimentStatus = async (experimentKey, status) => {
    try {
      setExperimentBusy(true);
      const response = await axios.patch(
        `${url}/api/admin/users/experiments/${encodeURIComponent(experimentKey)}/status`,
        { status },
        { headers: { token } }
      );
      if (response.data?.success) {
        setExperiments((prev) =>
          prev.map((row) => (row.key === experimentKey ? { ...row, status } : row))
        );
        toast.success("Experiment updated");
      } else {
        toast.error(response.data?.message || "Failed to update status");
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to update status");
    } finally {
      setExperimentBusy(false);
    }
  };

  const loadExperimentResults = async (experimentKey) => {
    try {
      setExperimentBusy(true);
      setSelectedExperimentKey(experimentKey);
      const response = await axios.get(
        `${url}/api/admin/users/experiments/${encodeURIComponent(experimentKey)}/results`,
        { headers: { token } }
      );
      if (response.data?.success) {
        setExperimentResults(response.data.data || null);
      } else {
        toast.error(response.data?.message || "Failed to load results");
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to load results");
    } finally {
      setExperimentBusy(false);
    }
  };

  const previewExperimentAssignment = async () => {
    try {
      if (!selectedExperimentKey) {
        toast.error("Select an experiment first");
        return;
      }
      if (!assignmentPreviewUserId.trim()) {
        toast.error("Enter a user ID");
        return;
      }
      setExperimentBusy(true);
      const response = await axios.get(
        `${url}/api/admin/users/experiments/${encodeURIComponent(
          selectedExperimentKey
        )}/preview-assignment`,
        { params: { userId: assignmentPreviewUserId.trim() }, headers: { token } }
      );
      if (response.data?.success) {
        setAssignmentPreviewResult(response.data.data || null);
      } else {
        toast.error(response.data?.message || "Failed to preview assignment");
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to preview assignment");
    } finally {
      setExperimentBusy(false);
    }
  };

  const createPartnerClient = async () => {
    try {
      const name = partnerForm.name.trim();
      const scopes = partnerSelectedScopes;
      if (scopes.length === 0) {
        setPartnerScopeError("Select at least one scope.");
        return;
      }
      setPartnerScopeError("");
      if (!name) {
        toast.error("Client name is required");
        return;
      }
      setPartnerBusy(true);
      const response = await axios.post(
        `${url}/api/admin/users/partner-clients`,
        { name, scopes },
        { headers: { token } }
      );
      if (response.data?.success) {
        const created = response.data?.data;
        setNewPartnerSecret(created || null);
        setPartnerForm({ name: "" });
        setPartnerScopeError("");
        toast.success("Partner API client created");
        const reload = await axios.get(`${url}/api/admin/users/partner-clients`, {
          headers: { token },
        });
        if (reload.data?.success) setPartnerClients(reload.data.data || []);
      } else {
        toast.error(response.data?.message || "Failed to create partner client");
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to create partner client");
    } finally {
      setPartnerBusy(false);
    }
  };

  const togglePartnerClient = async (clientId, active) => {
    try {
      setPartnerBusy(true);
      const response = await axios.patch(
        `${url}/api/admin/users/partner-clients/${encodeURIComponent(clientId)}/status`,
        { active },
        { headers: { token } }
      );
      if (response.data?.success) {
        setPartnerClients((prev) =>
          prev.map((row) => (row.clientId === clientId ? { ...row, active } : row))
        );
        toast.success(active ? "Client activated" : "Client deactivated");
      } else {
        toast.error(response.data?.message || "Failed to update client status");
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to update client status");
    } finally {
      setPartnerBusy(false);
    }
  };

  const rotatePartnerSecret = async (clientId) => {
    try {
      if (!window.confirm(`Rotate secret for ${clientId}? Old secret will stop working.`)) return;
      setPartnerBusy(true);
      const response = await axios.post(
        `${url}/api/admin/users/partner-clients/${encodeURIComponent(clientId)}/rotate-secret`,
        {},
        { headers: { token } }
      );
      if (response.data?.success) {
        setNewPartnerSecret(response.data?.data || null);
        toast.success("Partner secret rotated");
      } else {
        toast.error(response.data?.message || "Failed to rotate secret");
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to rotate secret");
    } finally {
      setPartnerBusy(false);
    }
  };

  const loadPartnerAudit = async (pageOverride = null, filterOverrides = null) => {
    try {
      setPartnerBusy(true);
      const nextPage = Number.isFinite(Number(pageOverride))
        ? Math.max(1, Math.floor(Number(pageOverride)))
        : partnerAuditPage;
      const nextFilters = {
        clientId:
          filterOverrides && Object.prototype.hasOwnProperty.call(filterOverrides, "clientId")
            ? String(filterOverrides.clientId || "")
            : partnerAuditFilterClientId,
        from:
          filterOverrides && Object.prototype.hasOwnProperty.call(filterOverrides, "from")
            ? String(filterOverrides.from || "")
            : partnerAuditFrom,
        to:
          filterOverrides && Object.prototype.hasOwnProperty.call(filterOverrides, "to")
            ? String(filterOverrides.to || "")
            : partnerAuditTo,
        statusClass:
          filterOverrides && Object.prototype.hasOwnProperty.call(filterOverrides, "statusClass")
            ? String(filterOverrides.statusClass || "")
            : partnerAuditStatusClass,
      };
      const response = await axios.get(`${url}/api/admin/users/partner-api/audit`, {
        headers: { token },
        params: {
          page: nextPage,
          limit: 20,
          clientId: nextFilters.clientId.trim() || undefined,
          from: nextFilters.from ? new Date(nextFilters.from).toISOString() : undefined,
          to: nextFilters.to ? new Date(nextFilters.to).toISOString() : undefined,
          statusClass: nextFilters.statusClass || undefined,
        },
      });
      if (response.data?.success) {
        setPartnerAuditRows(response.data?.data || []);
        const pg = response.data?.pagination || {};
        setPartnerAuditPage(pg.page || nextPage);
        setPartnerAuditTotalPages(pg.totalPages || 1);
        setPartnerAuditTotal(pg.total || 0);
      } else {
        toast.error(response.data?.message || "Failed to load partner audit logs");
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to load partner audit logs");
    } finally {
      setPartnerBusy(false);
    }
  };

  useEffect(() => {
    if (!partnerAuditAutoRefresh || !token || partnerAuditExporting || !partnerAuditTabVisible) {
      return undefined;
    }
    const timer = setInterval(() => {
      loadPartnerAudit(partnerAuditPage);
    }, 30000);
    return () => clearInterval(timer);
  }, [
    partnerAuditAutoRefresh,
    partnerAuditPage,
    token,
    partnerAuditExporting,
    partnerAuditTabVisible,
  ]);

  useEffect(() => {
    const onVisibilityChange = () => {
      setPartnerAuditTabVisible(!document.hidden);
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  const exportPartnerAuditCsv = async () => {
    try {
      setPartnerAuditExporting(true);
      setPartnerBusy(true);
      const response = await axios.get(`${url}/api/admin/users/partner-api/audit.csv`, {
        headers: { token },
        responseType: "blob",
        params: {
          limit: 1000,
          clientId: partnerAuditFilterClientId.trim() || undefined,
          from: partnerAuditFrom ? new Date(partnerAuditFrom).toISOString() : undefined,
          to: partnerAuditTo ? new Date(partnerAuditTo).toISOString() : undefined,
          statusClass: partnerAuditStatusClass || undefined,
        },
      });
      const blob = new Blob([response.data], { type: "text/csv;charset=utf-8;" });
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.setAttribute("download", `partner_api_audit_${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(href);
      toast.success("Audit CSV downloaded");
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to export partner audit CSV");
    } finally {
      setPartnerAuditExporting(false);
      setPartnerBusy(false);
    }
  };

  const resetPartnerAuditFilters = async () => {
    setPartnerAuditFilterClientId("");
    setPartnerAuditFrom("");
    setPartnerAuditTo("");
    setPartnerAuditStatusClass("");
    setPartnerAuditPage(1);
    await loadPartnerAudit(1, {
      clientId: "",
      from: "",
      to: "",
      statusClass: "",
    });
  };

  const copyText = async (text, successMsg = "Copied") => {
    try {
      await navigator.clipboard.writeText(String(text || ""));
      toast.success(successMsg);
    } catch {
      toast.error("Copy failed");
    }
  };

  if (loading) {
    return (
      <div className="dashboard">
        <div className="dashboard-loading">
          <p>Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h2>Admin Dashboard</h2>
        <p>Welcome back! Here's an overview of your food delivery system.</p>
      </div>

      <div className="dashboard-stats">
        {[
          {
            label: "Total Orders",
            value: stats.totalOrders,
            color: "#2196F3",
            route: "/orders",
          },
          {
            label: "Pending Orders",
            value: stats.pendingOrders,
            color: "#FF9800",
            route: "/orders?status=pending",
          },
          {
            label: "Out for Delivery",
            value: stats.outForDelivery,
            color: "#2196F3",
            route: "/orders?status=out_for_delivery",
          },
          {
            label: "Delivered",
            value: stats.deliveredOrders,
            color: "#4CAF50",
            route: "/orders?status=delivered",
          },
          {
            label: "Total Revenue",
            value: formatCurrency(stats.totalRevenue),
            color: "#9C27B0",
            route: "/orders?status=delivered",
          },
          {
            label: "Food Items",
            value: stats.totalFoodItems,
            color: "#F44336",
            route: "/list",
          },
          {
            label: "Scheduled Upcoming",
            value: stats.scheduledUpcoming,
            color: "#5e35b1",
            route: "/orders?scheduled=true",
          },
          {
            label: "Scheduled Due",
            value: stats.scheduledDue,
            color: "#ef6c00",
            route: "/orders?scheduled=true&dueOnly=true",
          },
          {
            label: "Scheduled Overdue",
            value: stats.scheduledOverdue,
            color: "#c62828",
            route: "/orders?scheduled=true&dueOnly=true",
          },
        ].map((card) => (
          <div
            key={card.label}
            className={`stat-card ${card.route ? "clickable" : ""}`}
            role={card.route ? "button" : "presentation"}
            tabIndex={card.route ? 0 : -1}
            onClick={() => card.route && navigate(card.route)}
            onKeyDown={(e) => {
              if (!card.route) return;
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                navigate(card.route);
              }
            }}
          >
            <div className="stat-icon" style={{ backgroundColor: card.color }}>
              <img src={assets.parcel_icon} alt={card.label} />
            </div>
            <div className="stat-info">
              <h3>{card.value}</h3>
              <p>{card.label}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="dashboard-stats">
        {[
          {
            label: "Referral Users",
            value: growthStats.referralUsers,
            color: "#00897b",
            route: "/profile",
          },
          {
            label: "Referred Signups",
            value: growthStats.referredUsers,
            color: "#2e7d32",
            route: "/profile",
          },
          {
            label: "Loyalty Users",
            value: growthStats.loyaltyUsers,
            color: "#6a1b9a",
            route: "/profile",
          },
          {
            label: "Campaign Runs (30d)",
            value: growthStats.campaignRuns30d,
            color: "#3949ab",
            route: "/offers",
          },
          {
            label: "Dynamic-Priced Orders (30d)",
            value: growthStats.dynamicPricedOrders30d,
            color: "#ef6c00",
            route: "/orders",
          },
        ].map((card) => (
          <div
            key={card.label}
            className={`stat-card ${card.route ? "clickable" : ""}`}
            role={card.route ? "button" : "presentation"}
            tabIndex={card.route ? 0 : -1}
            onClick={() => card.route && navigate(card.route)}
            onKeyDown={(e) => {
              if (!card.route) return;
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                navigate(card.route);
              }
            }}
          >
            <div className="stat-icon" style={{ backgroundColor: card.color }}>
              <img src={assets.parcel_icon} alt={card.label} />
            </div>
            <div className="stat-info">
              <h3>{card.value}</h3>
              <p>{card.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="dashboard-content">
        <div className="dashboard-section">
          <div className="section-header">
            <h3>Recent Orders</h3>
            <button onClick={() => navigate("/orders")} className="view-all-btn">
              View All Orders
            </button>
          </div>
          <div className="recent-orders-list">
            {recentOrders.length === 0 ? (
              <p className="no-orders">No orders yet</p>
            ) : (
              recentOrders.map((order, index) => (
                <div key={order._id || index} className="recent-order-item">
                  <div className="order-info-left">
                    <p className="order-number">
                      Order #{order.orderNumber || order._id?.slice(-8)}
                    </p>
                    <p className="order-items">
                      {order.items?.map((item) =>
                        `${item.name} x${item.quantity}`
                      ).join(", ") || "No items"}
                    </p>
                    <p className="order-customer">
                      {order.address?.name || 
                        (order.address?.firstName && order.address?.lastName
                          ? `${order.address.firstName} ${order.address.lastName}`
                          : "Unknown Customer")}
                    </p>
                    <p className="order-schedule">
                      {order?.scheduleMeta?.scheduledSlot?.date
                        ? `Scheduled ${order.scheduleMeta.scheduledSlot.date} ${order.scheduleMeta.scheduledSlot.startTime}-${order.scheduleMeta.scheduledSlot.endTime}`
                        : order?.scheduleMeta?.scheduledFor
                          ? `Scheduled ${new Date(order.scheduleMeta.scheduledFor).toLocaleString()}`
                          : "ASAP"}
                    </p>
                  </div>
                  <div className="order-info-right">
                    <p className="order-amount">
                      {formatCurrency(order.finalAmount ?? order.amount ?? 0)}
                    </p>
                    <span 
                      className="order-status-badge"
                      style={{ backgroundColor: getStatusColor(order.status) }}
                    >
                      {formatStatus(order.status)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="dashboard-section">
          <div className="section-header">
            <h3>Quick Actions</h3>
          </div>
          <div className="quick-actions">
            <button 
              className="action-btn"
              onClick={() => navigate("/add")}
            >
              <img src={assets.parcel_icon} alt="Add" />
              <span>Add Food Item</span>
            </button>
            <button 
              className="action-btn"
              onClick={() => navigate("/list")}
            >
              <img src={assets.parcel_icon} alt="List" />
              <span>View All Items</span>
            </button>
            <button 
              className="action-btn"
              onClick={() => navigate("/orders")}
            >
              <img src={assets.parcel_icon} alt="Orders" />
              <span>Manage Orders</span>
            </button>
          </div>
        </div>

        <div className="dashboard-section">
          <div className="section-header">
            <h3>Retention Operations</h3>
          </div>
          <div className="retention-last-run">
            <span
              className={`retention-status-badge ${
                retentionLastRun?.ok === true
                  ? "ok"
                  : retentionLastRun?.ok === false
                    ? "fail"
                    : "unknown"
              }`}
            >
              {retentionLastRun?.ok === true
                ? "Last run OK"
                : retentionLastRun?.ok === false
                  ? "Last run failed"
                  : "Last run unknown"}
            </span>
            <span className="retention-last-run-time">
              {retentionLastRun?.completedAt
                ? `Completed: ${new Date(retentionLastRun.completedAt).toLocaleString()}`
                : "No completed run yet"}
            </span>
          </div>
          <div className="retention-actions">
            <button
              className="action-btn"
              onClick={() => runRetentionNow(true)}
              disabled={retentionBusy}
            >
              <img src={assets.parcel_icon} alt="Dry run" />
              <span>{retentionBusy ? "Running..." : "Run Dry-Run"}</span>
            </button>
            <button
              className="action-btn"
              onClick={() => runRetentionNow(false)}
              disabled={retentionBusy}
            >
              <img src={assets.parcel_icon} alt="Execute" />
              <span>{retentionBusy ? "Running..." : "Execute Cleanup"}</span>
            </button>
          </div>
          {retentionResult?.results ? (
            <div className="retention-result">
              <p className="retention-title">
                Last run: {retentionResult.dryRun ? "Dry-run preview" : "Executed cleanup"}
              </p>
              <pre>{JSON.stringify(retentionResult.results, null, 2)}</pre>
            </div>
          ) : null}
        </div>

        <div className="dashboard-section">
          <div className="section-header">
            <h3>A/B Experiments</h3>
          </div>
          <div className="experiment-form">
            <input
              type="text"
              placeholder="Experiment key (e.g. checkout_button_v1)"
              value={experimentForm.key}
              onChange={(e) => setExperimentForm((p) => ({ ...p, key: e.target.value }))}
            />
            <input
              type="text"
              placeholder="Experiment name"
              value={experimentForm.name}
              onChange={(e) => setExperimentForm((p) => ({ ...p, name: e.target.value }))}
            />
            <textarea
              rows={3}
              placeholder={"Variants (one per line)\ncontrol:50\ntreatment:50"}
              value={experimentForm.variantsText}
              onChange={(e) =>
                setExperimentForm((p) => ({ ...p, variantsText: e.target.value }))
              }
            />
            <input
              type="text"
              placeholder="Audience tags (comma separated, optional)"
              value={experimentForm.audienceTagsText}
              onChange={(e) =>
                setExperimentForm((p) => ({ ...p, audienceTagsText: e.target.value }))
              }
            />
            <select
              value={experimentForm.audienceMode}
              onChange={(e) => setExperimentForm((p) => ({ ...p, audienceMode: e.target.value }))}
            >
              <option value="any">Audience mode: any tag</option>
              <option value="all">Audience mode: all tags</option>
            </select>
            <input
              type="datetime-local"
              value={experimentForm.startAt}
              onChange={(e) => setExperimentForm((p) => ({ ...p, startAt: e.target.value }))}
            />
            <input
              type="datetime-local"
              value={experimentForm.endAt}
              onChange={(e) => setExperimentForm((p) => ({ ...p, endAt: e.target.value }))}
            />
            <button
              className="view-all-btn"
              onClick={createExperiment}
              disabled={experimentBusy}
            >
              {experimentBusy ? "Please wait..." : "Create Experiment"}
            </button>
          </div>
          <div className="experiment-list">
            {experiments.length === 0 ? (
              <p className="no-orders">No experiments created yet.</p>
            ) : (
              experiments.slice(0, 10).map((exp) => (
                <div key={exp._id || exp.key} className="experiment-item">
                  <div>
                    <p className="order-number">{exp.name}</p>
                    <p className="order-items">{exp.key}</p>
                    <p className="order-customer">
                      Variants: {(exp.variants || []).map((v) => `${v.key}:${v.weight}`).join(", ")}
                    </p>
                    <p className="order-customer">
                      Audience: {(exp.audienceTags || []).length
                        ? `${exp.audienceMode || "any"} of [${(exp.audienceTags || []).join(", ")}]`
                        : "all users"}
                    </p>
                    <p className="order-customer">
                      Window: {exp.startAt ? new Date(exp.startAt).toLocaleString() : "now"} -{" "}
                      {exp.endAt ? new Date(exp.endAt).toLocaleString() : "open"}
                    </p>
                  </div>
                  <div className="experiment-actions">
                    <select
                      value={exp.status}
                      disabled={experimentBusy}
                      onChange={(e) => setExperimentStatus(exp.key, e.target.value)}
                    >
                      <option value="draft">draft</option>
                      <option value="active">active</option>
                      <option value="paused">paused</option>
                      <option value="archived">archived</option>
                    </select>
                    <button
                      className="view-all-btn"
                      onClick={() => loadExperimentResults(exp.key)}
                      disabled={experimentBusy}
                    >
                      Results
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
          {experimentResults ? (
            <div className="retention-result">
              <p className="retention-title">
                Results: {selectedExperimentKey} ({experimentResults?.assignments?.total || 0} assignments)
              </p>
              <pre>{JSON.stringify(experimentResults?.assignments?.byVariant || {}, null, 2)}</pre>
            </div>
          ) : null}
          <div className="experiment-preview-box">
            <p className="retention-title">Preview assignment for user</p>
            <input
              type="text"
              placeholder="User ID (Mongo ObjectId)"
              value={assignmentPreviewUserId}
              onChange={(e) => setAssignmentPreviewUserId(e.target.value)}
            />
            <button
              className="view-all-btn"
              onClick={previewExperimentAssignment}
              disabled={experimentBusy}
            >
              {experimentBusy ? "Please wait..." : "Preview Assignment"}
            </button>
            {assignmentPreviewResult ? (
              <pre>{JSON.stringify(assignmentPreviewResult, null, 2)}</pre>
            ) : null}
          </div>
        </div>

        <div className="dashboard-section">
          <div className="section-header">
            <h3>Partner API Clients</h3>
          </div>
          <div className="experiment-form">
            <input
              type="text"
              placeholder="Client name"
              value={partnerForm.name}
              onChange={(e) => setPartnerForm((p) => ({ ...p, name: e.target.value }))}
            />
            <div className="partner-scope-grid">
              {partnerScopeCatalog.map((scope) => (
                <label key={scope.key} className="partner-scope-option">
                  <input
                    type="checkbox"
                    checked={partnerSelectedScopes.includes(scope.key)}
                    onChange={(e) => {
                      setPartnerSelectedScopes((prev) => {
                        if (e.target.checked) return [...new Set([...prev, scope.key])];
                        return prev.filter((s) => s !== scope.key);
                      });
                    }}
                  />
                  <span className="partner-scope-key">{scope.key}</span>
                  <span className="partner-scope-description">
                    {scope.description || "No description"}
                  </span>
                </label>
              ))}
            </div>
            {partnerScopeError ? (
              <p className="partner-scope-error">{partnerScopeError}</p>
            ) : null}
            <button className="view-all-btn" onClick={createPartnerClient} disabled={partnerBusy}>
              {partnerBusy ? "Please wait..." : "Create Partner Client"}
            </button>
          </div>
          {newPartnerSecret?.clientId ? (
            <div className="partner-secret-box">
              <p className="retention-title">Copy this now (shown once)</p>
              <pre>{JSON.stringify({
                clientId: newPartnerSecret.clientId,
                clientSecret: newPartnerSecret.clientSecret,
                scopes: newPartnerSecret.scopes,
              }, null, 2)}</pre>
              <div className="partner-secret-actions">
                <button
                  className="view-all-btn"
                  onClick={() =>
                    copyText(
                      JSON.stringify(
                        {
                          clientId: newPartnerSecret.clientId,
                          clientSecret: newPartnerSecret.clientSecret,
                          scopes: newPartnerSecret.scopes,
                        },
                        null,
                        2
                      ),
                      "Credentials copied"
                    )
                  }
                >
                  Copy Credentials JSON
                </button>
              </div>
              <p className="retention-title" style={{ marginTop: "10px" }}>Quick test (PowerShell)</p>
              <pre>{`$token = Invoke-RestMethod -Method POST -Uri "${url}/api/partner/oauth/token" -ContentType "application/json" -Body '{"grant_type":"client_credentials","client_id":"${newPartnerSecret.clientId}","client_secret":"${newPartnerSecret.clientSecret}","scope":"orders.read"}'
Invoke-RestMethod -Method GET -Uri "${url}/api/partner/orders/ping" -Headers @{ Authorization = "Bearer $($token.access_token)" }`}</pre>
              <div className="partner-secret-actions">
                <button
                  className="view-all-btn"
                  onClick={() =>
                    copyText(
                      `$token = Invoke-RestMethod -Method POST -Uri "${url}/api/partner/oauth/token" -ContentType "application/json" -Body '{"grant_type":"client_credentials","client_id":"${newPartnerSecret.clientId}","client_secret":"${newPartnerSecret.clientSecret}","scope":"orders.read"}'\nInvoke-RestMethod -Method GET -Uri "${url}/api/partner/orders/ping" -Headers @{ Authorization = "Bearer $($token.access_token)" }`,
                      "PowerShell snippet copied"
                    )
                  }
                >
                  Copy PowerShell Snippet
                </button>
              </div>
            </div>
          ) : null}
          <div className="experiment-list">
            {partnerClients.length === 0 ? (
              <p className="no-orders">No partner clients yet.</p>
            ) : (
              partnerClients.map((client) => (
                <div key={client._id || client.clientId} className="experiment-item">
                  <div>
                    <p className="order-number">{client.name}</p>
                    <p className="order-items">{client.clientId}</p>
                    <p className="order-customer">Scopes: {(client.scopes || []).join(", ") || "-"}</p>
                    <p className="order-customer">
                      Last used: {client.lastUsedAt ? new Date(client.lastUsedAt).toLocaleString() : "Never"}
                    </p>
                  </div>
                  <div className="experiment-actions">
                    <span className={`partner-status ${client.active ? "active" : "inactive"}`}>
                      {client.active ? "active" : "inactive"}
                    </span>
                    <button
                      className="view-all-btn"
                      disabled={partnerBusy}
                      onClick={() => togglePartnerClient(client.clientId, !client.active)}
                    >
                      {client.active ? "Deactivate" : "Activate"}
                    </button>
                    <button
                      className="view-all-btn"
                      disabled={partnerBusy}
                      onClick={() => rotatePartnerSecret(client.clientId)}
                    >
                      Rotate Secret
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="experiment-preview-box">
            <p className="retention-title">Partner API Audit</p>
            <div className="partner-audit-filters">
              <input
                type="text"
                placeholder="Filter by clientId (optional)"
                value={partnerAuditFilterClientId}
                onChange={(e) => {
                  setPartnerAuditFilterClientId(e.target.value);
                  setPartnerAuditPage(1);
                }}
              />
              <input
                type="datetime-local"
                value={partnerAuditFrom}
                onChange={(e) => {
                  setPartnerAuditFrom(e.target.value);
                  setPartnerAuditPage(1);
                }}
                title="From"
              />
              <input
                type="datetime-local"
                value={partnerAuditTo}
                onChange={(e) => {
                  setPartnerAuditTo(e.target.value);
                  setPartnerAuditPage(1);
                }}
                title="To"
              />
              <select
                value={partnerAuditStatusClass}
                onChange={(e) => {
                  setPartnerAuditStatusClass(e.target.value);
                  setPartnerAuditPage(1);
                }}
              >
                <option value="">All statuses</option>
                <option value="2xx">2xx</option>
                <option value="4xx">4xx</option>
                <option value="5xx">5xx</option>
              </select>
              <button className="view-all-btn" onClick={loadPartnerAudit} disabled={partnerBusy}>
                {partnerBusy ? "Please wait..." : "Refresh Audit"}
              </button>
              <button className="view-all-btn" onClick={exportPartnerAuditCsv} disabled={partnerBusy}>
                {partnerBusy ? "Please wait..." : "Export CSV"}
              </button>
              <button className="view-all-btn" onClick={resetPartnerAuditFilters} disabled={partnerBusy}>
                {partnerBusy ? "Please wait..." : "Reset Filters"}
              </button>
              <label className="partner-audit-autorefresh">
                <input
                  type="checkbox"
                  checked={partnerAuditAutoRefresh}
                  disabled={partnerAuditExporting}
                  onChange={(e) => setPartnerAuditAutoRefresh(e.target.checked)}
                />
                <span>Auto-refresh (30s)</span>
              </label>
            </div>
            <p className="order-customer">
              Showing page {partnerAuditPage} of {partnerAuditTotalPages} ({partnerAuditTotal} logs)
            </p>
            <div className="partner-audit-active-filters">
              {partnerAuditFilterClientId ? (
                <button
                  type="button"
                  className="partner-audit-chip partner-audit-chip-btn"
                  onClick={() => {
                    setPartnerAuditFilterClientId("");
                    setPartnerAuditPage(1);
                    loadPartnerAudit(1, { clientId: "" });
                  }}
                >
                  clientId: {partnerAuditFilterClientId} x
                </button>
              ) : null}
              {partnerAuditFrom ? (
                <button
                  type="button"
                  className="partner-audit-chip partner-audit-chip-btn"
                  onClick={() => {
                    setPartnerAuditFrom("");
                    setPartnerAuditPage(1);
                    loadPartnerAudit(1, { from: "" });
                  }}
                >
                  from: {new Date(partnerAuditFrom).toLocaleString()} x
                </button>
              ) : null}
              {partnerAuditTo ? (
                <button
                  type="button"
                  className="partner-audit-chip partner-audit-chip-btn"
                  onClick={() => {
                    setPartnerAuditTo("");
                    setPartnerAuditPage(1);
                    loadPartnerAudit(1, { to: "" });
                  }}
                >
                  to: {new Date(partnerAuditTo).toLocaleString()} x
                </button>
              ) : null}
              {partnerAuditStatusClass ? (
                <button
                  type="button"
                  className="partner-audit-chip partner-audit-chip-btn"
                  onClick={() => {
                    setPartnerAuditStatusClass("");
                    setPartnerAuditPage(1);
                    loadPartnerAudit(1, { statusClass: "" });
                  }}
                >
                  status: {partnerAuditStatusClass} x
                </button>
              ) : null}
              {!partnerAuditFilterClientId &&
              !partnerAuditFrom &&
              !partnerAuditTo &&
              !partnerAuditStatusClass ? (
                <span className="partner-audit-chip">No active filters</span>
              ) : null}
            </div>
            {partnerAuditRows.length === 0 ? (
              <p className="no-orders">No partner API audit logs yet.</p>
            ) : (
              <div className="partner-audit-list">
                {partnerAuditRows.map((row) => (
                  <div
                    key={row._id || `${row.clientId}-${row.requestId}-${row.createdAt}`}
                    className="partner-audit-item"
                  >
                    <p>
                      <strong>{row.method}</strong> {row.endpoint} - {row.statusCode}
                    </p>
                    <p>
                      client: {row.clientId || "-"} | outcome: {row.authOutcome || "-"} |{" "}
                      latency: {row.durationMs || 0}ms
                    </p>
                    <p>{row.createdAt ? new Date(row.createdAt).toLocaleString() : "-"}</p>
                  </div>
                ))}
              </div>
            )}
            <div className="partner-audit-pagination">
              <button
                className="view-all-btn"
                disabled={partnerBusy || partnerAuditPage <= 1}
                onClick={() => loadPartnerAudit(partnerAuditPage - 1)}
              >
                Prev
              </button>
              <button
                className="view-all-btn"
                disabled={partnerBusy || partnerAuditPage >= partnerAuditTotalPages}
                onClick={() => loadPartnerAudit(partnerAuditPage + 1)}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;

