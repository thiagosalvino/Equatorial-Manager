/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import * as pdfjsLib from 'pdfjs-dist';

// Set PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

import { 
  FileText, 
  Upload, 
  Trash2, 
  Search, 
  Plus, 
  Loader2, 
  CheckCircle2, 
  AlertCircle,
  Calendar,
  User,
  Hash,
  Zap,
  DollarSign,
  ChevronRight,
  FileUp,
  RefreshCw,
  LayoutDashboard,
  ClipboardList,
  Inbox,
  Menu,
  X,
  Settings,
  LogOut,
  Edit2,
  Power,
  Filter,
  Clock
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Invoice {
  id: number;
  bordero_id: number;
  customer_name: string;
  uc_number: string;
  address: string;
  reference_month: string;
  due_date: string;
  total_amount: number;
  energy_consumption: number;
  items_detail: { description: string; value: number }[];
  created_at: string;
}

interface Classification {
  id: number;
  code: string;
  name: string;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
}

interface Bordero {
  id: number;
  classification_id: number;
  classification_name: string;
  classification_code: string;
  reference_month: string;
  status: 'aberto' | 'importado' | 'finalizado';
  created_by: string;
  created_at: string;
  updated_at: string;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'bordero' | 'classificacao'>('bordero');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [classifications, setClassifications] = useState<Classification[]>([]);
  const [borderos, setBorderos] = useState<Bordero[]>([]);
  
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modals/Forms state
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [invoiceToDelete, setInvoiceToDelete] = useState<number | null>(null);
  
  const [isClassificationModalOpen, setIsClassificationModalOpen] = useState(false);
  const [editingClassification, setEditingClassification] = useState<Classification | null>(null);
  const [classificationToDelete, setClassificationToDelete] = useState<number | null>(null);

  const [isBorderoModalOpen, setIsBorderoModalOpen] = useState(false);
  const [editingBordero, setEditingBordero] = useState<Bordero | null>(null);
  const [borderoToDelete, setBorderoToDelete] = useState<number | null>(null);

  // New states for Bordero-Invoice linking
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [borderoForImport, setBorderoForImport] = useState<Bordero | null>(null);
  const [isBorderoInvoicesModalOpen, setIsBorderoInvoicesModalOpen] = useState(false);
  const [borderoForInvoices, setBorderoForInvoices] = useState<Bordero | null>(null);
  const [borderoInvoices, setBorderoInvoices] = useState<Invoice[]>([]);
  const [loadingBorderoInvoices, setLoadingBorderoInvoices] = useState(false);
  const [selectedBorderoInvoice, setSelectedBorderoInvoice] = useState<Invoice | null>(null);
  const [borderoUcFilter, setBorderoUcFilter] = useState('');

  const borderoSummary = React.useMemo(() => {
    const total = borderoInvoices.reduce((acc, inv) => acc + inv.total_amount, 0);
    const itemsMap: Record<string, number> = {};
    borderoInvoices.forEach(inv => {
      inv.items_detail?.forEach(item => {
        const desc = item.description.trim().toUpperCase();
        itemsMap[desc] = (itemsMap[desc] || 0) + item.value;
      });
    });
    return {
      total,
      items: Object.entries(itemsMap).map(([description, value]) => ({ description, value }))
        .sort((a, b) => b.value - a.value)
    };
  }, [borderoInvoices]);

  // Filters for Bordero
  const [borderoFilterClassification, setBorderoFilterClassification] = useState('');
  const [borderoFilterCode, setBorderoFilterCode] = useState('');
  const [borderoFilterMonth, setBorderoFilterMonth] = useState('');

  // Filters for Dashboard
  const [dashboardFilterClassification, setDashboardFilterClassification] = useState('');
  const [dashboardFilterCode, setDashboardFilterCode] = useState('');
  const [dashboardFilterStartMonth, setDashboardFilterStartMonth] = useState('');
  const [dashboardFilterEndMonth, setDashboardFilterEndMonth] = useState('');
  const [dashboardFilterUc, setDashboardFilterUc] = useState('');

  const dashboardSummary = React.useMemo(() => {
    // Filter invoices based on dashboard filters
    const filteredInvoices = invoices.filter(inv => {
      const bordero = borderos.find(b => b.id === inv.bordero_id);
      const refMonth = bordero?.reference_month || inv.reference_month;
      
      const matchesClassification = !dashboardFilterClassification || bordero?.classification_id.toString() === dashboardFilterClassification;
      const matchesCode = !dashboardFilterCode || bordero?.classification_code.toLowerCase().includes(dashboardFilterCode.toLowerCase());
      
      let matchesMonth = true;
      if (dashboardFilterStartMonth && dashboardFilterEndMonth) {
        matchesMonth = refMonth >= dashboardFilterStartMonth && refMonth <= dashboardFilterEndMonth;
      } else if (dashboardFilterStartMonth) {
        matchesMonth = refMonth >= dashboardFilterStartMonth;
      } else if (dashboardFilterEndMonth) {
        matchesMonth = refMonth <= dashboardFilterEndMonth;
      }
      
      const matchesUc = !dashboardFilterUc || inv.uc_number.includes(dashboardFilterUc);
      
      return matchesClassification && matchesCode && matchesMonth && matchesUc;
    });

    const total = filteredInvoices.reduce((acc, inv) => acc + inv.total_amount, 0);
    const totalConsumption = filteredInvoices.reduce((acc, inv) => acc + (inv.energy_consumption || 0), 0);
    const itemsMap: Record<string, number> = {};
    
    filteredInvoices.forEach(inv => {
      inv.items_detail?.forEach(item => {
        const desc = item.description.trim().toUpperCase();
        itemsMap[desc] = (itemsMap[desc] || 0) + item.value;
      });
    });

    return {
      total,
      totalConsumption,
      count: filteredInvoices.length,
      items: Object.entries(itemsMap).map(([description, value]) => ({ description, value }))
        .sort((a, b) => b.value - a.value)
    };
  }, [invoices, borderos, dashboardFilterClassification, dashboardFilterCode, dashboardFilterStartMonth, dashboardFilterEndMonth, dashboardFilterUc]);

  const monthlyHistory = React.useMemo(() => {
    const months = [];
    
    // Determine the anchor date (either the selected filter end month or now)
    let anchorDate = new Date();
    if (dashboardFilterEndMonth) {
      const [year, month] = dashboardFilterEndMonth.split('-').map(Number);
      anchorDate = new Date(year, month - 1, 1);
    }

    // Generate 12 months ending at the anchor date
    for (let i = 11; i >= 0; i--) {
      const d = new Date(anchorDate.getFullYear(), anchorDate.getMonth() - i, 1);
      const monthStr = d.toISOString().slice(0, 7); // YYYY-MM
      months.push({
        month: monthStr,
        label: d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '').toUpperCase(),
        total: 0
      });
    }

    const filteredInvoices = invoices.filter(inv => {
      const bordero = borderos.find(b => b.id === inv.bordero_id);
      
      const matchesClassification = !dashboardFilterClassification || bordero?.classification_id.toString() === dashboardFilterClassification;
      const matchesCode = !dashboardFilterCode || bordero?.classification_code.toLowerCase().includes(dashboardFilterCode.toLowerCase());
      const matchesUc = !dashboardFilterUc || inv.uc_number.includes(dashboardFilterUc);
      
      return matchesClassification && matchesCode && matchesUc;
    });

    filteredInvoices.forEach(inv => {
      const bordero = borderos.find(b => b.id === inv.bordero_id);
      const refMonth = bordero?.reference_month || inv.reference_month;
      
      const monthData = months.find(m => m.month === refMonth);
      if (monthData) {
        monthData.total += inv.total_amount;
      }
    });

    const totalSum = months.reduce((acc, m) => acc + m.total, 0);
    const average = totalSum / months.length;
    const maxVal = Math.max(...months.map(m => m.total), average, 1);

    return {
      months: months.map(m => ({
        ...m,
        diffPercent: average > 0 ? ((m.total - average) / average) * 100 : 0
      })),
      average,
      maxVal
    };
  }, [invoices, borderos, dashboardFilterClassification, dashboardFilterCode, dashboardFilterEndMonth, dashboardFilterUc]);

  const [error, setError] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [invRes, classRes, bordRes] = await Promise.all([
        fetch('/api/invoices'),
        fetch('/api/classifications'),
        fetch('/api/borderos')
      ]);
      
      if (invRes.ok) setInvoices(await invRes.json());
      if (classRes.ok) setClassifications(await classRes.json());
      if (bordRes.ok) setBorderos(await bordRes.json());
    } catch (err) {
      console.error("Error fetching data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchInvoices = () => fetchData(); // Alias for existing calls

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file || !borderoForImport) return;

    // Check page count in frontend (Max 10 pages)
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      if (pdf.numPages > 10) {
        alert(`Atenção: Limite de páginas excedido. O arquivo possui ${pdf.numPages} páginas, mas o sistema permite a importação de no máximo 10 páginas por arquivo para garantir a precisão dos dados.`);
        return;
      }
    } catch (err) {
      console.warn("Could not check page count in frontend, proceeding with upload:", err);
    }

    setUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append('pdf', file);
    formData.append('bordero_id', borderoForImport.id.toString());

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const contentType = response.headers.get("content-type");
      if (!response.ok) {
        let errorMessage = 'Erro ao processar PDF';
        if (contentType && contentType.includes("application/json")) {
          const errData = await response.json();
          errorMessage = errData.error || errorMessage;
        } else {
          // If not JSON, try to get text for debugging
          const text = await response.text().catch(() => "");
          console.error("Server returned non-JSON error:", text);
          if (response.status === 504) errorMessage = "O servidor demorou muito para responder (Timeout). Tente novamente.";
          else if (response.status === 500) errorMessage = "Erro interno no servidor ao processar o arquivo.";
        }
        throw new Error(errorMessage);
      }

      if (!contentType || !contentType.includes("application/json")) {
        console.error("Invalid content type:", contentType);
        throw new Error("O servidor retornou uma resposta inválida. Por favor, tente novamente.");
      }

      await fetchData();
      setIsImportModalOpen(false);
      setBorderoForImport(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }, [borderoForImport, fetchData]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    multiple: false,
  });

  const deleteInvoice = async (id: number) => {
    try {
      const response = await fetch('/api/invoices/' + id, { method: 'DELETE' });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Falha ao excluir fatura');
      }
      
      // Update main invoices list
      setInvoices(prev => prev.filter(inv => inv.id !== id));
      
      // Update bordero invoices list if modal is open
      setBorderoInvoices(prev => {
        const newList = prev.filter(inv => inv.id !== id);
        // If the deleted invoice was selected, select the next one or null
        if (selectedBorderoInvoice?.id === id) {
          setSelectedBorderoInvoice(newList.length > 0 ? newList[0] : null);
        }
        return newList;
      });

      if (selectedInvoice?.id === id) setSelectedInvoice(null);
      setInvoiceToDelete(null);
      
      // Refresh data to ensure consistency
      fetchData();
    } catch (err: any) {
      setError(err.message || 'Erro ao excluir fatura.');
      setInvoiceToDelete(null);
    }
  };

  const filteredInvoices = invoices.filter(inv => 
    inv.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    inv.uc_number.includes(searchTerm)
  );

  const handleSaveClassification = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = {
      code: formData.get('code') as string,
      name: formData.get('name') as string,
      status: editingClassification ? editingClassification.status : 'active'
    };

    try {
      const url = editingClassification ? `/api/classifications/${editingClassification.id}` : '/api/classifications';
      const method = editingClassification ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (res.ok) {
        setIsClassificationModalOpen(false);
        setEditingClassification(null);
        fetchData();
      }
    } catch (err) {
      console.error("Error saving classification:", err);
    }
  };

  const handleDeleteClassification = async (id: number) => {
    try {
      const res = await fetch(`/api/classifications/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setClassificationToDelete(null);
        fetchData();
      }
    } catch (err) {
      console.error("Error deleting classification:", err);
    }
  };

  const handleSaveBordero = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = {
      classification_id: Number(formData.get('classification_id')),
      reference_month: formData.get('reference_month') as string
    };

    try {
      const url = editingBordero ? `/api/borderos/${editingBordero.id}` : '/api/borderos';
      const method = editingBordero ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (res.ok) {
        setIsBorderoModalOpen(false);
        setEditingBordero(null);
        fetchData();
      }
    } catch (err) {
      console.error("Error saving bordero:", err);
    }
  };

  const handleFinalizeBordero = async (id: number) => {
    try {
      const res = await fetch(`/api/borderos/${id}/finalize`, {
        method: 'PUT'
      });
      if (res.ok) {
        setIsBorderoInvoicesModalOpen(false);
        fetchData();
      }
    } catch (err) {
      console.error("Error finalizing bordero:", err);
    }
  };

  const handleReopenBordero = async (id: number) => {
    try {
      const res = await fetch(`/api/borderos/${id}/reopen`, {
        method: 'PUT'
      });
      if (res.ok) {
        setIsBorderoInvoicesModalOpen(false);
        fetchData();
      }
    } catch (err) {
      console.error("Error reopening bordero:", err);
    }
  };

  const handleDeleteBordero = async (id: number) => {
    try {
      const res = await fetch(`/api/borderos/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setBorderoToDelete(null);
        fetchData();
      }
    } catch (err) {
      console.error("Error deleting bordero:", err);
    }
  };

  const fetchBorderoInvoices = async (borderoId: number) => {
    setLoadingBorderoInvoices(true);
    try {
      const res = await fetch(`/api/borderos/${borderoId}/invoices`);
      if (res.ok) {
        const data = await res.json();
        setBorderoInvoices(data);
        if (data.length > 0) {
          setSelectedBorderoInvoice(data[0]);
        } else {
          setSelectedBorderoInvoice(null);
        }
      }
    } catch (err) {
      console.error("Error fetching bordero invoices:", err);
    } finally {
      setLoadingBorderoInvoices(false);
    }
  };

  const handleBorderoDoubleClick = (bordero: Bordero) => {
    setBorderoForInvoices(bordero);
    setIsBorderoInvoicesModalOpen(true);
    fetchBorderoInvoices(bordero.id);
  };

  const filteredBorderos = borderos.filter(b => {
    const matchClass = !borderoFilterClassification || b.classification_id === Number(borderoFilterClassification);
    const matchCode = !borderoFilterCode || b.classification_code?.toLowerCase().includes(borderoFilterCode.toLowerCase());
    const matchMonth = !borderoFilterMonth || b.reference_month === borderoFilterMonth;
    return matchClass && matchCode && matchMonth;
  });

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans flex overflow-hidden">
      {/* Sidebar */}
      <aside 
        className={cn(
          "bg-slate-900 text-white transition-all duration-300 ease-in-out flex flex-col z-30",
          isSidebarOpen ? "w-64" : "w-20"
        )}
      >
        <div className="p-6 flex items-center gap-3 border-b border-slate-800/50">
          <div className="bg-emerald-500 p-2 rounded-lg shrink-0">
            <Zap className="w-6 h-6 text-white" />
          </div>
          {isSidebarOpen && (
            <motion.h1 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-lg font-bold tracking-tight whitespace-nowrap"
            >
              Equatorial Manager
            </motion.h1>
          )}
        </div>

        <nav className="flex-1 p-4 space-y-2 mt-4">
          <SidebarItem 
            icon={<LayoutDashboard className="w-5 h-5" />} 
            label="Dashboard" 
            active={activeTab === 'dashboard'} 
            collapsed={!isSidebarOpen}
            onClick={() => setActiveTab('dashboard')}
          />
          <SidebarItem 
            icon={<ClipboardList className="w-5 h-5" />} 
            label="Borderô a Pagar" 
            active={activeTab === 'bordero'} 
            collapsed={!isSidebarOpen}
            onClick={() => setActiveTab('bordero')}
          />

          <div className="pt-4 pb-2 px-4">
            <div className={cn("h-px bg-slate-800/50 w-full mb-4", !isSidebarOpen && "hidden")} />
            {isSidebarOpen && (
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Cadastros Básicos</p>
            )}
          </div>

          <SidebarItem 
            icon={<Settings className="w-5 h-5" />} 
            label="Classificação" 
            active={activeTab === 'classificacao'} 
            collapsed={!isSidebarOpen}
            onClick={() => setActiveTab('classificacao')}
          />
        </nav>

        <div className="p-4 border-t border-slate-800/50 space-y-2">
          <SidebarItem 
            icon={<Settings className="w-5 h-5" />} 
            label="Configurações" 
            collapsed={!isSidebarOpen}
          />
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-800 transition-colors text-slate-400 hover:text-white"
          >
            {isSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            {isSidebarOpen && <span className="text-sm font-medium">Recolher Menu</span>}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        <main className="flex-1 overflow-y-auto p-6">
          <AnimatePresence mode="wait">
            {activeTab === 'dashboard' ? (
              <motion.div 
                key="dashboard"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="max-w-7xl mx-auto space-y-8"
              >
                {/* Modern Dashboard Filters */}
                <div className="bg-white p-6 rounded-[2.5rem] border border-slate-200/60 shadow-sm space-y-6">
                  <div className="flex items-center justify-between px-2">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-emerald-50 rounded-xl flex items-center justify-center">
                        <Filter className="w-4 h-4 text-emerald-500" />
                      </div>
                      <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Filtros de Análise</h3>
                    </div>
                    <button 
                      onClick={() => {
                        setDashboardFilterClassification('');
                        setDashboardFilterCode('');
                        setDashboardFilterStartMonth('');
                        setDashboardFilterEndMonth('');
                        setDashboardFilterUc('');
                      }}
                      className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Resetar Filtros
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <ClipboardList className="h-4 w-4 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
                      </div>
                      <select 
                        className="block w-full pl-11 pr-4 py-3.5 bg-slate-50 border-transparent rounded-2xl text-sm font-medium focus:bg-white focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all cursor-pointer appearance-none"
                        value={dashboardFilterClassification}
                        onChange={(e) => setDashboardFilterClassification(e.target.value)}
                      >
                        <option value="">Todas as Classificações</option>
                        {classifications.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <Hash className="h-4 w-4 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
                      </div>
                      <input 
                        type="text"
                        placeholder="Código Classificação..."
                        className="block w-full pl-11 pr-4 py-3.5 bg-slate-50 border-transparent rounded-2xl text-sm font-medium focus:bg-white focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all"
                        value={dashboardFilterCode}
                        onChange={(e) => setDashboardFilterCode(e.target.value)}
                      />
                    </div>

                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <Calendar className="h-4 w-4 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
                      </div>
                      <input 
                        type="month" 
                        className="block w-full pl-11 pr-4 py-3.5 bg-slate-50 border-transparent rounded-2xl text-sm font-medium focus:bg-white focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all"
                        value={dashboardFilterStartMonth}
                        onChange={(e) => setDashboardFilterStartMonth(e.target.value)}
                      />
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[8px] font-black text-slate-300 uppercase tracking-tighter pointer-events-none">Início</div>
                    </div>

                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <Calendar className="h-4 w-4 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
                      </div>
                      <input 
                        type="month" 
                        className="block w-full pl-11 pr-4 py-3.5 bg-slate-50 border-transparent rounded-2xl text-sm font-medium focus:bg-white focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all"
                        value={dashboardFilterEndMonth}
                        onChange={(e) => setDashboardFilterEndMonth(e.target.value)}
                      />
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[8px] font-black text-slate-300 uppercase tracking-tighter pointer-events-none">Fim</div>
                    </div>

                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <Search className="h-4 w-4 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
                      </div>
                      <input 
                        type="text"
                        placeholder="Unidade Consumidora (UC)..."
                        className="block w-full pl-11 pr-4 py-3.5 bg-slate-50 border-transparent rounded-2xl text-sm font-medium focus:bg-white focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all"
                        value={dashboardFilterUc}
                        onChange={(e) => setDashboardFilterUc(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <StatCard 
                    title="Total em Faturas" 
                    value={new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(dashboardSummary.total)} 
                    icon={<DollarSign className="text-emerald-500" />} 
                    trend={dashboardSummary.count > 0 ? `${dashboardSummary.count} faturas` : "Nenhuma fatura"} 
                  />
                  <StatCard 
                    title="Consumo Total" 
                    value={`${dashboardSummary.totalConsumption.toLocaleString('pt-BR')} kWh`} 
                    icon={<Zap className="text-amber-500" />} 
                    trend="Consolidado" 
                  />
                  <StatCard 
                    title="Média por Fatura" 
                    value={new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(dashboardSummary.count > 0 ? dashboardSummary.total / dashboardSummary.count : 0)} 
                    icon={<FileText className="text-blue-500" />} 
                    trend="Valor Médio" 
                    comingSoon={true}
                  />
                </div>
                
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm space-y-6">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-black text-slate-900 uppercase tracking-[0.2em]">Consolidado por Item</h4>
                      <div className="h-px flex-1 bg-slate-100 mx-6" />
                    </div>
                    
                    <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                      {dashboardSummary.items.length > 0 ? dashboardSummary.items.map((item) => (
                        <div key={item.description} className="group">
                          <div className="flex justify-between items-start mb-2">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider leading-tight max-w-[240px]">
                              {item.description}
                            </p>
                            <p className="text-sm font-black text-slate-900">
                              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.value)}
                            </p>
                          </div>
                          <div className="w-full bg-slate-50 h-2 rounded-full overflow-hidden border border-slate-100">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${(item.value / dashboardSummary.total) * 100}%` }}
                              transition={{ duration: 1, ease: "easeOut" }}
                              className="bg-emerald-500 h-full shadow-[0_0_10px_rgba(16,185,129,0.3)]"
                            />
                          </div>
                          <div className="flex justify-end mt-1">
                            <span className="text-[9px] font-bold text-slate-400">
                              {((item.value / dashboardSummary.total) * 100).toFixed(1)}% do total
                            </span>
                          </div>
                        </div>
                      )) : (
                        <div className="py-12 text-center text-slate-400">
                          <Inbox className="w-12 h-12 mx-auto mb-3 opacity-20" />
                          <p className="text-sm font-medium">Nenhum dado disponível para os filtros selecionados</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm flex flex-col relative overflow-hidden">
                    <div className="flex items-center justify-between mb-8">
                      <h4 className="text-xs font-black text-slate-900 uppercase tracking-[0.2em]">Distribuição de Custos</h4>
                      <div className="h-px flex-1 bg-slate-100 mx-6" />
                    </div>
                    
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-12">
                      <div className="w-20 h-20 bg-slate-50 rounded-[2rem] flex items-center justify-center mb-6 relative">
                        <LayoutDashboard className="w-10 h-10 text-slate-300" />
                        <div className="absolute -top-1 -right-1 w-6 h-6 bg-amber-500 rounded-full flex items-center justify-center border-4 border-white">
                          <Settings className="w-3 h-3 text-white animate-spin-slow" />
                        </div>
                      </div>
                      <h5 className="text-lg font-black text-slate-900 mb-2 tracking-tight">Em Breve</h5>
                      <p className="text-sm text-slate-500 max-w-[240px] leading-relaxed font-medium">
                        Estamos ajustando as informações necessárias para disponibilizar novos gráficos detalhados.
                      </p>
                      <div className="mt-8 px-4 py-2 bg-slate-100 rounded-xl text-[10px] font-black text-slate-500 uppercase tracking-widest">
                        Aguardando Levantamento
                      </div>
                    </div>
                  </div>
                </div>

                {/* Monthly Billing Chart */}
                <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm space-y-8">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-emerald-50 rounded-2xl flex items-center justify-center">
                        <Calendar className="w-5 h-5 text-emerald-500" />
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-slate-900 uppercase tracking-[0.2em]">Faturamento Mensal</h4>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Últimos 12 meses</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-emerald-500 rounded-sm" />
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Total Faturado</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-0.5 bg-slate-300 border-t border-dashed border-slate-400" />
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Média: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(monthlyHistory.average)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="h-72 w-full relative pt-12">
                    {/* Average Line */}
                    <div 
                      className="absolute left-0 right-0 border-t-2 border-dashed border-slate-200 z-10 flex items-center"
                      style={{ bottom: `${(monthlyHistory.average / monthlyHistory.maxVal) * 100}%` }}
                    >
                      <span className="absolute -left-2 -translate-x-full bg-slate-100 text-slate-500 text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-tighter">Média</span>
                    </div>

                    <div className="absolute inset-0 flex items-end justify-between gap-2 px-4">
                      {monthlyHistory.months.map((m, idx) => (
                        <div key={m.month} className="flex-1 flex flex-col items-center group relative h-full justify-end">
                          {/* Percentage Label - Visible on Hover/Click */}
                          <div className={cn(
                            "absolute z-20 opacity-0 group-hover:opacity-100 transition-all duration-300 transform -translate-y-1 group-hover:translate-y-0 pointer-events-none",
                            m.diffPercent >= 0 ? "text-emerald-600" : "text-red-500"
                          )}
                          style={{ bottom: `calc(${(m.total / monthlyHistory.maxVal) * 100}% + 4px)` }}
                          >
                            <span className="text-[8px] font-black whitespace-nowrap bg-white px-1.5 py-0.5 rounded-md shadow-lg border border-slate-100">
                              {m.diffPercent >= 0 ? '+' : ''}{m.diffPercent.toFixed(1)}%
                            </span>
                          </div>

                          {/* Bar */}
                          <motion.div 
                            initial={{ height: 0 }}
                            animate={{ height: `${(m.total / monthlyHistory.maxVal) * 100}%` }}
                            transition={{ duration: 1, delay: idx * 0.05, ease: "easeOut" }}
                            className={cn(
                              "w-full max-w-[40px] rounded-t-xl transition-all duration-300 relative group-hover:brightness-110",
                              m.total >= monthlyHistory.average ? "bg-emerald-500" : "bg-emerald-400/60"
                            )}
                          />

                          {/* Value R$ - Fixed between month and bar base */}
                          <div className="h-8 flex items-center justify-center">
                            <span className="text-[8px] font-black text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded uppercase tracking-tighter">
                              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(m.total)}
                            </span>
                          </div>

                          {/* Month Label */}
                          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                            {m.label}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : activeTab === 'bordero' ? (
              <motion.div 
                key="bordero"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="max-w-7xl mx-auto space-y-6"
              >
                <div className="flex justify-between items-end">
                  <div>
                    <h2 className="text-3xl font-black text-slate-900 tracking-tight">Borderô a Pagar</h2>
                    <p className="text-slate-400 text-sm font-medium mt-1">Gerencie e organize os pagamentos mensais por classificação.</p>
                  </div>
                  <button 
                    onClick={() => { setEditingBordero(null); setIsBorderoModalOpen(true); }}
                    className="bg-slate-900 hover:bg-slate-800 text-white px-6 py-3 rounded-2xl font-bold flex items-center gap-2 shadow-xl shadow-slate-900/10 transition-all active:scale-95"
                  >
                    <Plus className="w-5 h-5" />
                    Novo Borderô
                  </button>
                </div>

                {/* Modernized Filters */}
                <div className="bg-white/80 backdrop-blur-md p-6 rounded-[2rem] border border-slate-200/60 shadow-sm flex flex-wrap gap-6 items-center">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-emerald-500 rounded-xl shadow-lg shadow-emerald-500/20">
                      <Filter className="w-4 h-4 text-white" />
                    </div>
                    <div className="hidden sm:block">
                      <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest">Filtros</h3>
                      <p className="text-[10px] text-slate-400 font-bold uppercase">Refinar Busca</p>
                    </div>
                  </div>
                  
                  <div className="h-10 w-px bg-slate-200 hidden md:block" />

                  <div className="flex-1 flex flex-wrap gap-4">
                    <div className="relative group flex-1 min-w-[150px]">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <Hash className="h-4 w-4 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
                      </div>
                      <input 
                        type="text" 
                        placeholder="Filtrar Código..."
                        className="block w-full pl-11 pr-4 py-3 bg-slate-50 border-transparent rounded-2xl text-sm font-medium focus:bg-white focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all"
                        value={borderoFilterCode}
                        onChange={(e) => setBorderoFilterCode(e.target.value)}
                      />
                    </div>

                    <div className="relative group flex-1 min-w-[240px]">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <ClipboardList className="h-4 w-4 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
                      </div>
                      <select 
                        className="block w-full pl-11 pr-4 py-3 bg-slate-50 border-transparent rounded-2xl text-sm font-medium focus:bg-white focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all cursor-pointer appearance-none"
                        value={borderoFilterClassification}
                        onChange={(e) => setBorderoFilterClassification(e.target.value)}
                      >
                        <option value="">Todas as Classificações</option>
                        {classifications.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="relative group flex-1 min-w-[200px]">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <Calendar className="h-4 w-4 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
                      </div>
                      <input 
                        type="month" 
                        className="block w-full pl-11 pr-4 py-3 bg-slate-50 border-transparent rounded-2xl text-sm font-medium focus:bg-white focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all"
                        value={borderoFilterMonth}
                        onChange={(e) => setBorderoFilterMonth(e.target.value)}
                      />
                    </div>
                  </div>

                  <button 
                    onClick={() => { setBorderoFilterClassification(''); setBorderoFilterCode(''); setBorderoFilterMonth(''); }}
                    className="p-3 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-all flex items-center gap-2 text-xs font-bold uppercase tracking-widest"
                    title="Limpar Filtros"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span className="hidden lg:inline">Resetar</span>
                  </button>
                </div>

                <div className="bg-white rounded-[2.5rem] border border-slate-200/60 shadow-sm overflow-hidden">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-slate-50/50">
                        <th className="text-left p-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-100">Código</th>
                        <th className="text-left p-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-100">Classificação</th>
                        <th className="text-left p-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-100">Referência</th>
                        <th className="text-left p-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-100">Status</th>
                        <th className="text-left p-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-100">Responsável</th>
                        <th className="text-left p-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-100">Registro</th>
                        <th className="text-right p-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-100">Gerenciar</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {filteredBorderos.length > 0 ? filteredBorderos.map(b => (
                        <tr 
                          key={b.id} 
                          onDoubleClick={() => handleBorderoDoubleClick(b)}
                          className="hover:bg-slate-50/80 transition-all group cursor-pointer select-none"
                        >
                          <td className="p-6">
                            <span className="px-3 py-1.5 bg-slate-100 rounded-xl text-sm font-black text-slate-700 uppercase tracking-tighter">
                              {b.classification_code || '---'}
                            </span>
                          </td>
                          <td className="p-6">
                            <span className="font-bold text-slate-700">{b.classification_name || 'N/A'}</span>
                          </td>
                          <td className="p-6">
                            <div className="inline-flex items-center gap-2 px-3 py-1 bg-slate-100 rounded-full text-xs font-bold text-slate-600">
                              <Calendar className="w-3 h-3" />
                              {b.reference_month ? b.reference_month.split('-').reverse().join('/') : 'N/A'}
                            </div>
                          </td>
                          <td className="p-6">
                            <span className={cn(
                              "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest",
                              b.status === 'aberto' && "bg-amber-100 text-amber-700",
                              b.status === 'importado' && "bg-emerald-100 text-emerald-700",
                              b.status === 'finalizado' && "bg-blue-100 text-blue-700"
                            )}>
                              {b.status || 'aberto'}
                            </span>
                          </td>
                          <td className="p-6">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center text-[10px] font-bold text-white uppercase">
                                {b.created_by?.charAt(0)}
                              </div>
                              <span className="text-sm font-medium text-slate-600">{b.created_by}</span>
                            </div>
                          </td>
                          <td className="p-6">
                            <div className="flex flex-col">
                              <span className="text-xs font-bold text-slate-700">
                                {new Date(b.created_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                              </span>
                              <span className="text-[10px] text-slate-400 font-medium">
                                {new Date(b.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}
                              </span>
                            </div>
                          </td>
                          <td className="p-6 text-right">
                            <div className="flex justify-end gap-2">
                              <button 
                                onClick={(e) => { e.stopPropagation(); setBorderoForImport(b); setIsImportModalOpen(true); }}
                                disabled={b.status === 'finalizado'}
                                className={cn(
                                  "p-2.5 rounded-xl transition-all",
                                  b.status === 'finalizado'
                                    ? "text-slate-200 cursor-not-allowed bg-slate-50"
                                    : "text-slate-400 hover:text-blue-600 hover:bg-blue-50"
                                )}
                                title={b.status === 'finalizado' ? "Não é possível importar em um borderô finalizado" : "Importar Faturas"}
                              >
                                <FileUp className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={(e) => { e.stopPropagation(); setEditingBordero(b); setIsBorderoModalOpen(true); }}
                                disabled={b.status === 'finalizado'}
                                className={cn(
                                  "p-2.5 rounded-xl transition-all",
                                  b.status === 'finalizado'
                                    ? "text-slate-200 cursor-not-allowed bg-slate-50"
                                    : "text-slate-400 hover:text-emerald-600 hover:bg-emerald-50"
                                )}
                                title={b.status === 'finalizado' ? "Não é possível editar um borderô finalizado" : "Editar"}
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={(e) => { e.stopPropagation(); setBorderoToDelete(b.id); }}
                                disabled={b.status === 'finalizado'}
                                className={cn(
                                  "p-2.5 rounded-xl transition-all",
                                  b.status === 'finalizado' 
                                    ? "text-slate-200 cursor-not-allowed bg-slate-50" 
                                    : "text-slate-400 hover:text-red-500 hover:bg-red-50"
                                )}
                                title={b.status === 'finalizado' ? "Não é possível excluir um borderô finalizado" : "Excluir"}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )) : (
                        <tr>
                          <td colSpan={5} className="p-20 text-center">
                            <div className="max-w-xs mx-auto">
                              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Inbox className="w-8 h-8 text-slate-200" />
                              </div>
                              <h3 className="text-slate-900 font-bold">Nenhum borderô encontrado</h3>
                              <p className="text-slate-400 text-sm mt-1">Tente ajustar seus filtros ou crie um novo registro.</p>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            ) : activeTab === 'classificacao' ? (
              <motion.div 
                key="classificacao"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="max-w-7xl mx-auto space-y-6"
              >
                <div className="flex justify-between items-center">
                  <h2 className="text-2xl font-bold text-slate-800">Classificação</h2>
                  <button 
                    onClick={() => { setEditingClassification(null); setIsClassificationModalOpen(true); }}
                    className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-emerald-500/20 transition-all"
                  >
                    <Plus className="w-5 h-5" />
                    Nova Classificação
                  </button>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-slate-50 border-b border-slate-100">
                      <tr>
                        <th className="text-left p-4 text-[10px] font-bold text-slate-400 uppercase">Código</th>
                        <th className="text-left p-4 text-[10px] font-bold text-slate-400 uppercase">Nome</th>
                        <th className="text-left p-4 text-[10px] font-bold text-slate-400 uppercase">Status</th>
                        <th className="text-left p-4 text-[10px] font-bold text-slate-400 uppercase">Última Alteração</th>
                        <th className="text-right p-4 text-[10px] font-bold text-slate-400 uppercase">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {classifications.map(c => (
                        <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                          <td className="p-4">
                            <span className="px-3 py-1.5 bg-slate-100 rounded-xl text-sm font-black text-slate-700 uppercase tracking-tighter">
                              {c.code || '---'}
                            </span>
                          </td>
                          <td className="p-4">
                            <span className="font-semibold text-slate-700">{c.name}</span>
                          </td>
                          <td className="p-4">
                            <span className={cn(
                              "px-2 py-1 rounded-full text-[10px] font-bold uppercase",
                              c.status === 'active' ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                            )}>
                              {c.status === 'active' ? 'Ativo' : 'Inativo'}
                            </span>
                          </td>
                          <td className="p-4 text-xs text-slate-400">
                            {new Date(c.updated_at).toLocaleString('pt-BR')}
                          </td>
                          <td className="p-4 text-right">
                            <div className="flex justify-end gap-2">
                              <button 
                                onClick={() => { setEditingClassification(c); setIsClassificationModalOpen(true); }}
                                className="p-2 text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 rounded-lg transition-all"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={async () => {
                                  const newStatus = c.status === 'active' ? 'inactive' : 'active';
                                  await fetch(`/api/classifications/${c.id}`, {
                                    method: 'PUT',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ code: c.code, name: c.name, status: newStatus })
                                  });
                                  fetchData();
                                }}
                                className={cn(
                                  "p-2 rounded-lg transition-all",
                                  c.status === 'active' ? "text-slate-400 hover:text-amber-500 hover:bg-amber-50" : "text-amber-500 bg-amber-50 hover:bg-amber-100"
                                )}
                                title={c.status === 'active' ? 'Inativar' : 'Ativar'}
                              >
                                <Power className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={() => setClassificationToDelete(c.id)}
                                className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </main>

        {/* Footer */}
        <footer className="px-6 py-4 border-t border-slate-200 bg-white shrink-0">
          <div className="flex justify-between items-center opacity-50">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4" />
              <span className="text-[10px] font-bold uppercase tracking-widest">Equatorial Manager v1.1</span>
            </div>
            <p className="text-[10px] text-slate-400 italic">© 2024 Sistema de Gestão Inteligente</p>
          </div>
        </footer>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {/* Import Modal */}
        {isImportModalOpen && borderoForImport && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[2.5rem] shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-100"
            >
              <div className="p-8 pb-0 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-blue-500 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/20">
                    <FileUp className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-slate-800">Importar Faturas</h3>
                    <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">
                      Vincular ao Borderô: <span className="text-slate-600 font-bold">{borderoForImport.classification_name} ({borderoForImport.reference_month})</span>
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsImportModalOpen(false)}
                  className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                >
                  <X className="w-6 h-6 text-slate-400" />
                </button>
              </div>

              <div className="p-8 space-y-6">
                <div 
                  {...getRootProps()} 
                  className={cn(
                    "border-2 border-dashed rounded-3xl p-12 transition-all cursor-pointer flex flex-col items-center justify-center gap-4",
                    isDragActive ? "border-blue-500 bg-blue-50" : "border-slate-200 bg-slate-50 hover:border-blue-400 hover:bg-white",
                    uploading && "pointer-events-none opacity-60"
                  )}
                >
                  <input {...getInputProps()} />
                  <div className="bg-blue-100 p-4 rounded-full">
                    {uploading ? (
                      <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                    ) : (
                      <FileUp className="w-8 h-8 text-blue-600" />
                    )}
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-semibold text-slate-700">
                      {uploading ? "Processando fatura..." : "Arraste sua fatura PDF aqui"}
                    </p>
                    <p className="text-sm text-slate-500">Ou clique para selecionar o arquivo</p>
                  </div>
                </div>

                {error && (
                  <div className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-3 text-red-600">
                    <AlertCircle className="w-5 h-5 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-bold text-sm">Erro na Importação</p>
                      <p className="text-xs opacity-90">{error}</p>
                    </div>
                  </div>
                )}

                <div className="flex justify-end">
                  <button 
                    onClick={() => setIsImportModalOpen(false)}
                    className="px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl font-bold text-sm transition-all"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {/* Bordero Invoices Modal */}
        {isBorderoInvoicesModalOpen && borderoForInvoices && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[2.5rem] shadow-2xl max-w-[98vw] w-full overflow-hidden border border-slate-100 h-[90vh] flex flex-col"
            >
              <div className="p-8 border-b border-slate-100 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
                      <FileText className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-slate-800">Faturas do Borderô</h3>
                      <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">
                        [{borderoForInvoices.classification_code}] {borderoForInvoices.classification_name} — {borderoForInvoices.reference_month}
                      </p>
                    </div>
                  </div>

                  <div className="h-10 w-px bg-slate-100" />

                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</span>
                    <span className={cn(
                      "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest inline-flex items-center justify-center",
                      borderoForInvoices.status === 'aberto' && "bg-amber-100 text-amber-700",
                      borderoForInvoices.status === 'importado' && "bg-emerald-100 text-emerald-700",
                      borderoForInvoices.status === 'finalizado' && "bg-blue-100 text-blue-700"
                    )}>
                      {borderoForInvoices.status || 'aberto'}
                    </span>
                  </div>
                </div>
                <button 
                  onClick={() => setIsBorderoInvoicesModalOpen(false)}
                  className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                >
                  <X className="w-6 h-6 text-slate-400" />
                </button>
              </div>

              <div className="flex-1 overflow-hidden flex">
                {loadingBorderoInvoices ? (
                  <div className="flex-1 flex flex-col items-center justify-center gap-3">
                    <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
                    <p className="text-slate-500 font-medium">Carregando faturas vinculadas...</p>
                  </div>
                ) : borderoInvoices.length > 0 ? (
                  <>
                    {/* Left Side: Invoice List */}
                    <div className="w-80 border-r border-slate-100 overflow-y-auto p-6 space-y-4 bg-slate-50/30">
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Lista de Faturas ({borderoInvoices.length})</p>
                        </div>
                        
                        {/* UC Filter */}
                        <div className="relative group">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Search className="h-3.5 w-3.5 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
                          </div>
                          <input 
                            type="text"
                            placeholder="Filtrar UC ou Nome..."
                            className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all shadow-sm"
                            value={borderoUcFilter}
                            onChange={(e) => setBorderoUcFilter(e.target.value)}
                          />
                        </div>
                      </div>

                      <div className="space-y-3">
                        {borderoInvoices.filter(inv => 
                          inv.uc_number.includes(borderoUcFilter) || 
                          inv.customer_name.toLowerCase().includes(borderoUcFilter.toLowerCase())
                        ).map(invoice => (
                          <div 
                            key={invoice.id}
                            onClick={() => setSelectedBorderoInvoice(invoice)}
                            className={cn(
                              "p-4 rounded-2xl border transition-all cursor-pointer group relative overflow-hidden",
                              selectedBorderoInvoice?.id === invoice.id 
                                ? "bg-white border-emerald-500 shadow-lg shadow-emerald-500/10 ring-1 ring-emerald-500/20" 
                                : "bg-white border-slate-200/60 hover:border-emerald-300 hover:shadow-md"
                            )}
                          >
                            {selectedBorderoInvoice?.id === invoice.id && (
                              <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500" />
                            )}
                            <div className="flex justify-between items-start mb-1.5">
                              <h4 className="font-bold text-slate-800 text-xs truncate max-w-[140px]">{invoice.customer_name}</h4>
                              <p className="text-[10px] font-black text-slate-900">
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(invoice.total_amount)}
                              </p>
                            </div>
                            <div className="flex justify-between items-center">
                              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">UC: {invoice.uc_number}</p>
                              <p className="text-[9px] text-slate-400 font-bold uppercase">Vence {invoice.due_date}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Middle: Invoice Details */}
                    <div className="flex-1 overflow-y-auto p-8 bg-white border-r border-slate-100">
                      {selectedBorderoInvoice ? (
                        <motion.div 
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          key={selectedBorderoInvoice.id}
                          className="space-y-8"
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="flex items-center gap-3 mb-2">
                                <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-black uppercase tracking-widest">Fatura Selecionada</span>
                                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">ID: #{selectedBorderoInvoice.id}</span>
                              </div>
                              <h2 className="text-2xl font-black text-slate-900 tracking-tight">{selectedBorderoInvoice.customer_name}</h2>
                              <p className="text-slate-400 text-sm font-medium">Unidade Consumidora: <span className="text-slate-600 font-bold">{selectedBorderoInvoice.uc_number}</span></p>
                              <p className="text-slate-400 text-xs font-medium mt-1">Endereço: <span className="text-slate-500">{selectedBorderoInvoice.address || 'Não identificado'}</span></p>
                            </div>
                            <div className="text-right">
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Valor Total</p>
                              <p className="text-3xl font-black text-emerald-600 tracking-tighter">
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(selectedBorderoInvoice.total_amount)}
                              </p>
                            </div>
                          </div>

                          <div className="grid grid-cols-3 gap-4">
                            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                              <div className="flex items-center gap-2 mb-1">
                                <Calendar className="w-3.5 h-3.5 text-emerald-500" />
                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Referência</p>
                              </div>
                              <p className="text-base font-bold text-slate-700">{selectedBorderoInvoice.reference_month}</p>
                            </div>
                            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                              <div className="flex items-center gap-2 mb-1">
                                <Clock className="w-3.5 h-3.5 text-emerald-500" />
                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Vencimento</p>
                              </div>
                              <p className="text-base font-bold text-slate-700">{selectedBorderoInvoice.due_date}</p>
                            </div>
                            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                              <div className="flex items-center gap-2 mb-1">
                                <Zap className="w-3.5 h-3.5 text-emerald-500" />
                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Consumo</p>
                              </div>
                              <p className="text-base font-bold text-slate-700">{selectedBorderoInvoice.energy_consumption} <span className="text-[10px] font-medium text-slate-400">kWh</span></p>
                            </div>
                          </div>

                          <div className="space-y-4">
                            <div className="flex items-center justify-between">
                              <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-[0.2em]">Itens da Fatura</h4>
                              <div className="h-px flex-1 bg-slate-100 mx-4" />
                            </div>
                            <div className="bg-slate-50/50 rounded-2xl border border-slate-100 overflow-hidden">
                              <table className="w-full">
                                <thead>
                                  <tr className="bg-slate-100/50">
                                    <th className="text-left p-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Descrição</th>
                                    <th className="text-right p-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Valor (R$)</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {selectedBorderoInvoice.items_detail?.map((item, idx) => (
                                    <tr key={`${item.description}-${idx}`} className="hover:bg-white transition-colors">
                                      <td className="p-3 text-xs font-medium text-slate-600">{item.description}</td>
                                      <td className="p-3 text-right font-bold text-slate-800 text-xs">
                                        {new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(item.value)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>

                          <div className="flex gap-3">
                            <button 
                              onClick={() => window.print()}
                              className="flex-1 py-3 bg-slate-900 text-white rounded-xl font-bold text-xs shadow-xl shadow-slate-900/20 hover:bg-slate-800 transition-all active:scale-95 flex items-center justify-center gap-2"
                            >
                              <FileText className="w-3.5 h-3.5" />
                              Imprimir
                            </button>
                            <button 
                              onClick={() => setInvoiceToDelete(selectedBorderoInvoice.id)}
                              disabled={borderoForInvoices.status === 'finalizado'}
                              className={cn(
                                "px-5 py-3 rounded-xl font-bold text-xs transition-all active:scale-95 flex items-center justify-center gap-2",
                                borderoForInvoices.status === 'finalizado'
                                  ? "bg-slate-50 text-slate-300 cursor-not-allowed"
                                  : "bg-red-50 text-red-600 hover:bg-red-100"
                              )}
                              title={borderoForInvoices.status === 'finalizado' ? "Não é possível excluir faturas de um borderô finalizado" : "Excluir"}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Excluir
                            </button>
                          </div>
                        </motion.div>
                      ) : (
                        <div className="h-full flex flex-col items-center justify-center text-center">
                          <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                            <ChevronRight className="w-8 h-8 text-slate-200" />
                          </div>
                          <h3 className="text-slate-900 font-bold text-base">Selecione uma fatura</h3>
                          <p className="text-slate-400 text-xs max-w-xs mx-auto mt-2">
                            Escolha uma fatura na lista ao lado para visualizar o detalhamento completo.
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Right Side: Bordero Summary */}
                    <div className="w-[28rem] overflow-y-auto p-8 bg-slate-50/50 space-y-8">
                      <div className="space-y-6">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center shadow-lg shadow-slate-900/20">
                            <LayoutDashboard className="w-5 h-5 text-white" />
                          </div>
                          <div>
                            <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest">Resumo do Borderô</h4>
                            <p className="text-[10px] text-slate-400 font-bold uppercase">Consolidado Geral</p>
                          </div>
                        </div>

                        <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm space-y-3">
                          <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Valor Total do Borderô</p>
                            <p className="text-3xl font-black text-slate-900 tracking-tighter">
                              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(borderoSummary.total)}
                            </p>
                          </div>
                          
                          <div className="pt-3 border-t border-slate-100 space-y-2">
                            <div className="flex items-center justify-between">
                              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Classificação</p>
                              <p className="text-[10px] font-black text-slate-700 uppercase">[{borderoForInvoices.classification_code}] {borderoForInvoices.classification_name}</p>
                            </div>
                            <div className="flex items-center justify-between">
                              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Referência</p>
                              <p className="text-[10px] font-black text-slate-700 uppercase">{borderoForInvoices.reference_month}</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 pt-1">
                            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-[9px] font-black uppercase tracking-widest">
                              {borderoInvoices.length} Faturas
                            </span>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-[0.2em]">Somatória por Item</h4>
                            <div className="h-px flex-1 bg-slate-200 mx-4" />
                          </div>

                          <div className="space-y-3">
                            {borderoSummary.items.map((item) => (
                              <div key={item.description} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm group hover:border-emerald-200 transition-all">
                                <div className="flex justify-between items-start mb-1">
                                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider leading-tight max-w-[180px]">
                                    {item.description}
                                  </p>
                                  <p className="text-sm font-black text-slate-900">
                                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.value)}
                                  </p>
                                </div>
                                <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden mt-2">
                                  <motion.div 
                                    initial={{ width: 0 }}
                                    animate={{ width: `${(item.value / borderoSummary.total) * 100}%` }}
                                    className="bg-emerald-500 h-full"
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-center">
                    <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                      <Inbox className="w-10 h-10 text-slate-200" />
                    </div>
                    <h3 className="text-slate-900 font-bold text-lg">Nenhuma fatura vinculada</h3>
                    <p className="text-slate-400 max-w-xs mx-auto mt-2">
                      Este borderô ainda não possui faturas importadas. Utilize o botão de importação na lista para começar.
                    </p>
                  </div>
                )}
              </div>

              <div className="p-8 border-t border-slate-100 shrink-0 flex justify-end gap-4">
                {borderoForInvoices.status === 'importado' && borderoInvoices.length > 0 && (
                  <button 
                    onClick={() => handleFinalizeBordero(borderoForInvoices.id)}
                    className="px-8 py-3.5 bg-emerald-500 text-white rounded-2xl font-bold text-sm shadow-xl shadow-emerald-500/20 transition-all active:scale-95 flex items-center gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Finalizar Processo
                  </button>
                )}
                {borderoForInvoices.status === 'finalizado' && (
                  <button 
                    onClick={() => handleReopenBordero(borderoForInvoices.id)}
                    className="px-8 py-3.5 bg-amber-500 text-white rounded-2xl font-bold text-sm shadow-xl shadow-amber-500/20 transition-all active:scale-95 flex items-center gap-2"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Reabrir Processo
                  </button>
                )}
                <button 
                  onClick={() => setIsBorderoInvoicesModalOpen(false)}
                  className="px-8 py-3.5 bg-slate-900 text-white rounded-2xl font-bold text-sm shadow-xl shadow-slate-900/20 transition-all active:scale-95"
                >
                  Fechar Visualização
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Modernized Classification Modal */}
        {isClassificationModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[2.5rem] shadow-2xl max-w-md w-full overflow-hidden border border-slate-100"
            >
              <div className="p-8 pb-0 flex items-center gap-4">
                <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
                  <Settings className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-800">
                    {editingClassification ? 'Editar Classificação' : 'Nova Classificação'}
                  </h3>
                  <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">Cadastros Básicos</p>
                </div>
              </div>

              <form onSubmit={handleSaveClassification} className="p-8 space-y-6">
                <div className="space-y-4">
                  <div className="space-y-2 group">
                    <label className="text-[10px] font-bold text-slate-400 uppercase ml-1 tracking-widest">Código da Classificação</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <Hash className="h-4 w-4 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
                      </div>
                      <input 
                        name="code"
                        defaultValue={editingClassification?.code}
                        required
                        className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border-transparent rounded-2xl text-sm focus:bg-white focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all"
                        placeholder="Ex: 001"
                      />
                    </div>
                  </div>

                  <div className="space-y-2 group">
                    <label className="text-[10px] font-bold text-slate-400 uppercase ml-1 tracking-widest">Nome da Classificação</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <Edit2 className="h-4 w-4 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
                      </div>
                      <input 
                        name="name"
                        defaultValue={editingClassification?.name}
                        required
                        className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border-transparent rounded-2xl text-sm focus:bg-white focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all"
                        placeholder="Ex: Prédios Públicos"
                      />
                    </div>
                    <p className="text-[10px] text-slate-400 ml-1">O status inicial será definido como <span className="text-emerald-500 font-bold">Ativo</span> por padrão.</p>
                  </div>
                </div>

                <div className="flex gap-4 pt-2">
                  <button 
                    type="button"
                    onClick={() => setIsClassificationModalOpen(false)}
                    className="flex-1 px-6 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl font-bold text-sm transition-all active:scale-95"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 px-6 py-3.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl font-bold text-sm shadow-xl shadow-emerald-500/20 transition-all active:scale-95"
                  >
                    Salvar Registro
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {/* Modernized Bordero Modal */}
        {isBorderoModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[2.5rem] shadow-2xl max-w-md w-full overflow-hidden border border-slate-100"
            >
              <div className="p-8 pb-0 flex items-center gap-4">
                <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
                  <ClipboardList className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-800">
                    {editingBordero ? 'Editar Borderô' : 'Novo Borderô'}
                  </h3>
                  <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">Gestão de Pagamentos</p>
                </div>
              </div>

              <form onSubmit={handleSaveBordero} className="p-8 space-y-6">
                <div className="space-y-4">
                  <div className="space-y-2 group">
                    <label className="text-[10px] font-bold text-slate-400 uppercase ml-1 tracking-widest">Classificação do Pagamento</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <Hash className="h-4 w-4 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
                      </div>
                      <select 
                        name="classification_id"
                        defaultValue={editingBordero?.classification_id}
                        required
                        className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border-transparent rounded-2xl text-sm focus:bg-white focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all cursor-pointer appearance-none"
                      >
                        <option value="">Selecione uma classificação...</option>
                        {classifications.filter(c => c.status === 'active').map(c => (
                          <option key={c.id} value={c.id}>[{c.code}] {c.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2 group">
                    <label className="text-[10px] font-bold text-slate-400 uppercase ml-1 tracking-widest">Mês de Referência</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <Calendar className="h-4 w-4 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
                      </div>
                      <input 
                        name="reference_month"
                        type="month"
                        defaultValue={editingBordero?.reference_month}
                        required
                        className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border-transparent rounded-2xl text-sm focus:bg-white focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex gap-4 pt-2">
                  <button 
                    type="button"
                    onClick={() => setIsBorderoModalOpen(false)}
                    className="flex-1 px-6 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl font-bold text-sm transition-all active:scale-95"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 px-6 py-3.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl font-bold text-sm shadow-xl shadow-emerald-500/20 transition-all active:scale-95"
                  >
                    Salvar Registro
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {/* Delete Confirmations */}
        {classificationToDelete && (
          <DeleteConfirmationModal 
            onCancel={() => setClassificationToDelete(null)}
            onConfirm={() => handleDeleteClassification(classificationToDelete)}
          />
        )}

        {borderoToDelete && (
          <DeleteConfirmationModal 
            onCancel={() => setBorderoToDelete(null)}
            onConfirm={() => handleDeleteBordero(borderoToDelete)}
          />
        )}

        {invoiceToDelete && (
          <DeleteConfirmationModal 
            onCancel={() => setInvoiceToDelete(null)}
            onConfirm={() => deleteInvoice(invoiceToDelete)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function DeleteConfirmationModal({ onCancel, onConfirm }: { onCancel: () => void, onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 overflow-hidden"
      >
        <div className="flex items-center gap-4 mb-6">
          <div className="bg-red-100 p-3 rounded-full">
            <Trash2 className="w-6 h-6 text-red-600" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-800">Confirmar Exclusão?</h3>
            <p className="text-sm text-slate-500">Esta ação não pode ser desfeita.</p>
          </div>
        </div>
        
        <div className="flex gap-3">
          <button 
            onClick={onCancel}
            className="flex-1 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold transition-colors"
          >
            Cancelar
          </button>
          <button 
            onClick={onConfirm}
            className="flex-1 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-xl font-semibold shadow-lg shadow-red-500/20 transition-colors"
          >
            Excluir
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function SidebarItem({ icon, label, active = false, collapsed = false, onClick }: { 
  icon: React.ReactNode, 
  label: string, 
  active?: boolean, 
  collapsed?: boolean,
  onClick?: () => void 
}) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 p-3 rounded-xl transition-all duration-200 group",
        active 
          ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20" 
          : "text-slate-400 hover:bg-slate-800 hover:text-white"
      )}
    >
      <div className={cn("shrink-0", active ? "text-white" : "group-hover:text-emerald-400 transition-colors")}>
        {icon}
      </div>
      {!collapsed && (
        <motion.span 
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          className="text-sm font-medium whitespace-nowrap"
        >
          {label}
        </motion.span>
      )}
      {active && !collapsed && (
        <motion.div 
          layoutId="active-indicator"
          className="ml-auto w-1.5 h-1.5 bg-white rounded-full"
        />
      )}
    </button>
  );
}

function StatCard({ title, value, icon, trend, comingSoon }: { title: string, value: string, icon: React.ReactNode, trend: string, comingSoon?: boolean }) {
  const isPositive = trend.startsWith('+');
  const isNegative = trend.startsWith('-');
  const isNeutral = !isPositive && !isNegative;

  return (
    <div className={cn(
      "bg-white p-6 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden",
      comingSoon && "bg-slate-50/50"
    )}>
      {comingSoon && (
        <div className="absolute inset-0 z-10 bg-white/40 backdrop-blur-[1px] flex items-center justify-center p-4">
          <div className="bg-slate-900/90 text-white px-4 py-2 rounded-2xl shadow-xl flex items-center gap-2 transform -rotate-2">
            <Settings className="w-4 h-4 animate-spin-slow" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em]">Em Breve</span>
          </div>
        </div>
      )}
      <div className={cn("flex justify-between items-start mb-4", comingSoon && "opacity-20 grayscale")}>
        <div className="p-3 bg-slate-50 rounded-2xl">
          {icon}
        </div>
        <span className={cn(
          "text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider",
          isPositive && "bg-emerald-50 text-emerald-600",
          isNegative && "bg-red-50 text-red-600",
          isNeutral && "bg-slate-100 text-slate-500"
        )}>
          {trend}
        </span>
      </div>
      <div className={comingSoon ? "opacity-20 grayscale" : ""}>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{title}</p>
        <h3 className="text-2xl font-black text-slate-900 tracking-tighter">{value}</h3>
      </div>
    </div>
  );
}
