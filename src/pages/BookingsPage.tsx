import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { CheckCircle2, XCircle, FileText } from 'lucide-react';
import { Badge } from '../components/Badge';

export default function BookingsPage() {
  const [leads, setLeads] = useState<any[]>([]);

  useEffect(() => {
    const fetchLeads = async () => {
      const { data } = await supabase
        .from('booking_leads')
        .select('*, tickets(customer:customers(name, phone_number))')
        .order('created_at', { ascending: false });
      setLeads(data || []);
    };
    fetchLeads();

    const sub = supabase.channel('leads')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'booking_leads' }, fetchLeads)
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  }, []);

  const updateStatus = async (id: string, status: string) => {
    await supabase.from('booking_leads').update({ status }).eq('id', id);
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Pending Bookings</h1>
        <p className="text-slate-500">Verify customer documents and payment receipts here.</p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50">
              <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">Customer</th>
              <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">Car & Details</th>
              <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">Status</th>
              <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {leads.map((lead) => (
              <tr key={lead.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-6 py-4">
                  <p className="text-sm font-bold text-slate-900">{lead.tickets?.customer?.name || lead.customer_phone}</p>
                  <p className="text-xs text-slate-500">{lead.tickets?.customer?.phone_number}</p>
                </td>
                <td className="px-6 py-4">
                  <p className="text-sm font-bold text-slate-800">{lead.car_model}</p>
                  <p className="text-xs text-slate-500">{lead.area} • {lead.rental_dates}</p>
                </td>
                <td className="px-6 py-4">
                  <Badge variant={lead.status === 'confirmed' ? 'success' : lead.status === 'rejected' ? 'error' : 'warning'}>
                    {lead.status.replace('_', ' ')}
                  </Badge>
                </td>
                <td className="px-6 py-4 text-right">
                  {lead.status === 'pending_verification' && (
                    <div className="flex justify-end gap-2">
                      <button onClick={() => updateStatus(lead.id, 'rejected')} className="p-2 text-red-500 hover:bg-red-50 rounded-lg">
                        <XCircle className="w-5 h-5" />
                      </button>
                      <button onClick={() => updateStatus(lead.id, 'confirmed')} className="p-2 text-emerald-500 hover:bg-emerald-50 rounded-lg">
                        <CheckCircle2 className="w-5 h-5" />
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
