'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Client } from '@/types/types';
import { getClientById } from '@/services/clientService';

// Available couriers in the system
const AVAILABLE_COURIERS = ['Blue Dart', 'DTDC'];

interface EditSubAccountDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: () => void;
    subAccount: Client;
    parentCouriers?: string[];
}

export const EditSubAccountDialog = ({
    open,
    onOpenChange,
    onSuccess,
    subAccount,
    parentCouriers: _parentCouriers
}: EditSubAccountDialogProps) => {
    const { currentUser, firebaseUser } = useAuth();
    const [loading, setLoading] = useState(false);
    const [parentCouriers, setParentCouriers] = useState<string[]>([]);

    // Form state
    const [formData, setFormData] = useState({
        name: '',
        phone: '',
        marginType: 'flat' as 'flat' | 'percentage',
        marginValue: 0,
        allowedCouriers: [] as string[]
    });

    const [errors, setErrors] = useState<Record<string, string>>({});

    // Fetch parent's allowed couriers on mount
    useEffect(() => {
        const fetchParentCouriers = async () => {
            if (currentUser?.id) {
                try {
                    const parentClient = await getClientById(currentUser.id);
                    if (parentClient?.allowedCouriers) {
                        setParentCouriers(parentClient.allowedCouriers);
                    }
                } catch (error) {
                    console.error('Error fetching parent couriers:', error);
                }
            }
        };
        fetchParentCouriers();
    }, [currentUser?.id]);

    // Initialize form with sub-account data
    useEffect(() => {
        if (open && subAccount) {
            setFormData({
                name: subAccount.name || '',
                phone: subAccount.phone || '',
                marginType: subAccount.marginType || 'flat',
                marginValue: subAccount.marginValue || 0,
                allowedCouriers: subAccount.allowedCouriers || []
            });
            setErrors({});
        }
    }, [open, subAccount]);

    const validateForm = (): boolean => {
        const newErrors: Record<string, string> = {};

        if (!formData.name.trim()) {
            newErrors.name = 'Name is required';
        }

        if (!formData.phone.trim()) {
            newErrors.phone = 'Phone is required';
        } else if (!/^\d{10}$/.test(formData.phone.replace(/\D/g, ''))) {
            newErrors.phone = 'Phone must be 10 digits';
        }

        if (formData.marginValue < 0) {
            newErrors.marginValue = 'Margin cannot be negative';
        }

        if (formData.allowedCouriers.length === 0) {
            newErrors.allowedCouriers = 'Select at least one courier';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!validateForm() || !firebaseUser) return;

        try {
            setLoading(true);
            const token = await firebaseUser.getIdToken();

            const res = await fetch(`/api/sub-accounts/${subAccount.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    name: formData.name.trim(),
                    phone: formData.phone.trim(),
                    marginType: formData.marginType,
                    marginValue: formData.marginValue,
                    allowedCouriers: formData.allowedCouriers
                })
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Failed to update sub-account');
            }

            toast.success('Sub-account updated successfully');
            onSuccess();
        } catch (error: any) {
            console.error('Error updating sub-account:', error);
            toast.error(error.message || 'Failed to update sub-account');
        } finally {
            setLoading(false);
        }
    };

    const handleCourierToggle = (courier: string) => {
        setFormData(prev => ({
            ...prev,
            allowedCouriers: prev.allowedCouriers.includes(courier)
                ? prev.allowedCouriers.filter(c => c !== courier)
                : [...prev.allowedCouriers, courier]
        }));
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-slate-800 border-slate-700 text-white sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle className="text-xl font-semibold">Edit Sub-account</DialogTitle>
                    <DialogDescription className="text-slate-400">
                        Update details for {subAccount.name}
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-5 mt-4">
                    {/* Name */}
                    <div className="space-y-2">
                        <Label htmlFor="edit-name" className="text-slate-300">Name</Label>
                        <Input
                            id="edit-name"
                            value={formData.name}
                            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                            placeholder="Business Partner Name"
                            className="bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500"
                        />
                        {errors.name && (
                            <p className="text-sm text-red-400 flex items-center gap-1">
                                <AlertCircle className="h-3 w-3" />
                                {errors.name}
                            </p>
                        )}
                    </div>

                    {/* Email (Read-only) */}
                    <div className="space-y-2">
                        <Label className="text-slate-300">Email</Label>
                        <Input
                            value={subAccount.email}
                            disabled
                            className="bg-slate-900/30 border-slate-700 text-slate-400 cursor-not-allowed"
                        />
                        <p className="text-xs text-slate-500">Email cannot be changed</p>
                    </div>

                    {/* Phone */}
                    <div className="space-y-2">
                        <Label htmlFor="edit-phone" className="text-slate-300">Phone</Label>
                        <Input
                            id="edit-phone"
                            type="tel"
                            value={formData.phone}
                            onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                            placeholder="10-digit mobile number"
                            className="bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500"
                        />
                        {errors.phone && (
                            <p className="text-sm text-red-400 flex items-center gap-1">
                                <AlertCircle className="h-3 w-3" />
                                {errors.phone}
                            </p>
                        )}
                    </div>

                    {/* Margin Settings */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label className="text-slate-300">Margin Type</Label>
                            <Select
                                value={formData.marginType}
                                onValueChange={(value: 'flat' | 'percentage') =>
                                    setFormData(prev => ({ ...prev, marginType: value }))
                                }
                            >
                                <SelectTrigger className="bg-slate-900/50 border-slate-600 text-white">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-slate-800 border-slate-700">
                                    <SelectItem value="flat">Flat (₹)</SelectItem>
                                    <SelectItem value="percentage">Percentage (%)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="edit-marginValue" className="text-slate-300">
                                Margin Value
                            </Label>
                            <Input
                                id="edit-marginValue"
                                type="number"
                                min="0"
                                step={formData.marginType === 'percentage' ? '0.1' : '1'}
                                value={formData.marginValue}
                                onChange={(e) => setFormData(prev => ({ ...prev, marginValue: parseFloat(e.target.value) || 0 }))}
                                className="bg-slate-900/50 border-slate-600 text-white"
                            />
                            {errors.marginValue && (
                                <p className="text-sm text-red-400">{errors.marginValue}</p>
                            )}
                        </div>
                    </div>

                    {/* Allowed Couriers */}
                    <div className="space-y-3">
                        <Label className="text-slate-300">Allowed Couriers</Label>
                        <div className="flex flex-wrap gap-4">
                            {(parentCouriers.length > 0 ? parentCouriers : AVAILABLE_COURIERS).map(courier => (
                                <label
                                    key={courier}
                                    className="flex items-center gap-2 cursor-pointer"
                                >
                                    <Checkbox
                                        checked={formData.allowedCouriers.includes(courier)}
                                        onCheckedChange={() => handleCourierToggle(courier)}
                                        className="border-slate-500 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                                    />
                                    <span className="text-sm text-slate-300">{courier}</span>
                                </label>
                            ))}
                        </div>
                        {errors.allowedCouriers && (
                            <p className="text-sm text-red-400 flex items-center gap-1">
                                <AlertCircle className="h-3 w-3" />
                                {errors.allowedCouriers}
                            </p>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="flex justify-end gap-3 pt-4 border-t border-slate-700">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            className="bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600"
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            disabled={loading}
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                        >
                            {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                            Save Changes
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
};
