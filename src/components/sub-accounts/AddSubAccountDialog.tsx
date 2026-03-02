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
import { Loader2, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { getClientById } from '@/services/clientService';

// Available couriers in the system
const AVAILABLE_COURIERS = ['Blue Dart', 'DTDC'];

interface AddSubAccountDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: () => void;
    parentCouriers?: string[];
}

export const AddSubAccountDialog = ({
    open,
    onOpenChange,
    onSuccess,
    parentCouriers: _parentCouriers
}: AddSubAccountDialogProps) => {
    const { currentUser, firebaseUser } = useAuth();
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [parentCouriers, setParentCouriers] = useState<string[]>([]);

    // Form state
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        phone: '',
        password: '',
        confirmPassword: '',
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
                        // Default to all parent couriers selected
                        setFormData(prev => ({
                            ...prev,
                            allowedCouriers: parentClient.allowedCouriers
                        }));
                    }
                } catch (error) {
                    console.error('Error fetching parent couriers:', error);
                }
            }
        };
        fetchParentCouriers();
    }, [currentUser?.id]);

    // Reset form when dialog opens
    useEffect(() => {
        if (open) {
            setFormData({
                name: '',
                email: '',
                phone: '',
                password: '',
                confirmPassword: '',
                marginType: 'flat',
                marginValue: 0,
                allowedCouriers: parentCouriers
            });
            setErrors({});
        }
    }, [open, parentCouriers]);

    const validateForm = (): boolean => {
        const newErrors: Record<string, string> = {};

        if (!formData.name.trim()) {
            newErrors.name = 'Name is required';
        }

        if (!formData.email.trim()) {
            newErrors.email = 'Email is required';
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
            newErrors.email = 'Invalid email format';
        }

        if (!formData.phone.trim()) {
            newErrors.phone = 'Phone is required';
        } else if (!/^\d{10}$/.test(formData.phone.replace(/\D/g, ''))) {
            newErrors.phone = 'Phone must be 10 digits';
        }

        if (!formData.password) {
            newErrors.password = 'Password is required';
        } else if (formData.password.length < 6) {
            newErrors.password = 'Password must be at least 6 characters';
        }

        if (formData.password !== formData.confirmPassword) {
            newErrors.confirmPassword = 'Passwords do not match';
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

            const res = await fetch('/api/sub-accounts', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    name: formData.name.trim(),
                    email: formData.email.trim().toLowerCase(),
                    phone: formData.phone.trim(),
                    password: formData.password,
                    marginType: formData.marginType,
                    marginValue: formData.marginValue,
                    allowedCouriers: formData.allowedCouriers
                })
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Failed to create sub-account');
            }

            toast.success('Sub-account created successfully');
            onSuccess();
        } catch (error: any) {
            console.error('Error creating sub-account:', error);
            toast.error(error.message || 'Failed to create sub-account');
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
                    <DialogTitle className="text-xl font-semibold">Add Sub-account</DialogTitle>
                    <DialogDescription className="text-slate-400">
                        Create a new sub-account for your business partner.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-5 mt-4">
                    {/* Name */}
                    <div className="space-y-2">
                        <Label htmlFor="name" className="text-slate-300">Name</Label>
                        <Input
                            id="name"
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

                    {/* Email */}
                    <div className="space-y-2">
                        <Label htmlFor="email" className="text-slate-300">Email</Label>
                        <Input
                            id="email"
                            type="email"
                            value={formData.email}
                            onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                            placeholder="partner@example.com"
                            className="bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500"
                        />
                        {errors.email && (
                            <p className="text-sm text-red-400 flex items-center gap-1">
                                <AlertCircle className="h-3 w-3" />
                                {errors.email}
                            </p>
                        )}
                    </div>

                    {/* Phone */}
                    <div className="space-y-2">
                        <Label htmlFor="phone" className="text-slate-300">Phone</Label>
                        <Input
                            id="phone"
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

                    {/* Password */}
                    <div className="space-y-2">
                        <Label htmlFor="password" className="text-slate-300">Password</Label>
                        <div className="relative">
                            <Input
                                id="password"
                                type={showPassword ? 'text' : 'password'}
                                value={formData.password}
                                onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                                placeholder="Min 6 characters"
                                className="bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500 pr-10"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                            >
                                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                        </div>
                        {errors.password && (
                            <p className="text-sm text-red-400 flex items-center gap-1">
                                <AlertCircle className="h-3 w-3" />
                                {errors.password}
                            </p>
                        )}
                    </div>

                    {/* Confirm Password */}
                    <div className="space-y-2">
                        <Label htmlFor="confirmPassword" className="text-slate-300">Confirm Password</Label>
                        <Input
                            id="confirmPassword"
                            type={showPassword ? 'text' : 'password'}
                            value={formData.confirmPassword}
                            onChange={(e) => setFormData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                            placeholder="Confirm password"
                            className="bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500"
                        />
                        {errors.confirmPassword && (
                            <p className="text-sm text-red-400 flex items-center gap-1">
                                <AlertCircle className="h-3 w-3" />
                                {errors.confirmPassword}
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
                            <Label htmlFor="marginValue" className="text-slate-300">
                                Margin Value
                            </Label>
                            <Input
                                id="marginValue"
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
                            Create Sub-account
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
};
