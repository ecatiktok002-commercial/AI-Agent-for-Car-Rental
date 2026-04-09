import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { CheckCircle2, Clock, Calendar, User, RefreshCw, AlertCircle } from 'lucide-react';
import { Badge } from '../components/Badge';
import { BookingLead } from '../types';

export default function BookingsPage() {
  const [leads, setLeads] = useState<BookingLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLeads = async () => {
    setLoading(true);
    console.log("Fetching booking leads...");
    const { data, error: fetchError } = await supabase
      .from('booking_leads')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (fetchError) {
      console.error("Error fetching leads:", fetchError);
      setError(fetchError.message);
    } else {
      setLeads(data || []);
      setError(null);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchLeads();

    const sub = supabase.channel('leads_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'booking_leads' }, fetchLeads)
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  }, []);

  const toggleStatus = async (lead: BookingLead) => {
    const newStatus = lead.status === 'Pending' ? 'Done' : 'Pending';
    const { error: updateError } = await supabase
      .from('booking_leads')
      .update({ status: newStatus })
      .eq('id', lead.id);

    if (updateError) {
      console.error("Error updating status:", updateError);
      alert("Failed to update status: " + updateError.message);
    } else {
      // Optimistic update
      setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, status: newStatus } : l));
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Admin Bookings Dashboard</h1>
          <p className="text-slate-500">Manage and verify customer car rental bookings.</p>
        </div>
        <button 
          onClick={fetchLeads}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-center gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <p>{error}</p>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Customer</th>
              <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Booking Info</th>
              <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {leads.map((lead) => (
              <tr key={lead.id} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
                      <User className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-900">{lead.customer_phone}</p>
                      <p className="text-[10px] text-slate-400 font-mono">ID: {lead.id.slice(0, 8)}</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-slate-800">Vehicle: {lead.vehicle_model}</p>
                    <div className="flex flex-col gap-0.5">
                      <span className="flex items-center gap-1.5 text-xs text-slate-500">
                        <Calendar className="w-3.5 h-3.5" /> Pickup: {lead.pickup_date} @ {lead.pickup_time}
                      </span>
                      <span className="flex items-center gap-1.5 text-xs text-slate-500">
                        <Clock className="w-3.5 h-3.5" /> Price: {lead.price} for {lead.duration}
                      </span>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <Badge variant={lead.status === 'Done' ? 'success' : 'warning'}>
                    {lead.status}
                  </Badge>
                </td>
                <td className="px-6 py-4">
                  <button
                    onClick={() => toggleStatus(lead)}
                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                      lead.status === 'Pending' 
                        ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100' 
                        : 'bg-amber-50 text-amber-600 hover:bg-amber-100'
                    }`}
                  >
                    {lead.status === 'Pending' ? (
                      <><CheckCircle2 className="w-4 h-4" /> Mark as Done</>
                    ) : (
                      <><Clock className="w-4 h-4" /> Revert to Pending</>
                    )}
                  </button>
                </td>
              </tr>
            ))}
            {!loading && leads.length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center text-slate-400 italic">
                  No bookings found in the database.
                </td>
              </tr>
            )}
            {loading && leads.length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center text-slate-400">
                  <div className="flex items-center justify-center gap-2">
                    <RefreshCw className="w-5 h-5 animate-spin text-blue-500" />
                    <span className="text-sm text-slate-500">Loading bookings...</span>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
