'use client';

import { useState } from "react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { User, Lock, Mail, Shield, Save, Camera } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";

export default function SettingsPage() {
    const [isLoading, setIsLoading] = useState(false);

    const handleSave = () => {
        setIsLoading(true);
        // Simulate API call
        setTimeout(() => {
            setIsLoading(false);
            toast.success("Settings saved successfully");
        }, 1000);
    };

    return (
        <div className="space-y-6 max-w-5xl mx-auto pb-20">
            <div>
                <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Settings</h1>
                <p className="text-muted-foreground text-sm mt-1">Manage your account settings and preferences.</p>
            </div>

            <Tabs defaultValue="account" className="space-y-6">
                <TabsList className="bg-slate-100/50 p-1 border border-slate-200">
                    <TabsTrigger value="account" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">
                        <User className="w-4 h-4 mr-2" />
                        Account
                    </TabsTrigger>
                    <TabsTrigger value="security" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">
                        <Lock className="w-4 h-4 mr-2" />
                        Security
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="account">
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="grid gap-6"
                    >
                        {/* Profile Card */}
                        <Card>
                            <CardHeader>
                                <CardTitle>Profile Information</CardTitle>
                                <CardDescription>Update your photo and personal details.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-8">
                                <div className="flex flex-col md:flex-row gap-8 items-start">
                                    <div className="flex flex-col items-center gap-4">
                                        <div className="relative group cursor-pointer">
                                            <Avatar className="w-24 h-24 border-4 border-slate-50 shadow-xl">
                                                <AvatarImage src="" />
                                                <AvatarFallback className="bg-gradient-to-tr from-blue-600 to-indigo-600 text-white text-2xl font-bold">SA</AvatarFallback>
                                            </Avatar>
                                            <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                <Camera className="w-6 h-6 text-white" />
                                            </div>
                                        </div>
                                        <div className="text-center">
                                            <p className="text-sm font-medium text-slate-900">Super Admin</p>
                                            <p className="text-xs text-slate-500">Administrator</p>
                                        </div>
                                    </div>

                                    <div className="flex-1 space-y-4 w-full max-w-md">
                                        <div className="grid gap-2">
                                            <Label htmlFor="username">Username</Label>
                                            <div className="relative">
                                                <User className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                                                <Input id="username" placeholder="johndoe" defaultValue="superadmin" className="pl-9" />
                                            </div>
                                        </div>
                                        <div className="grid gap-2">
                                            <Label htmlFor="email">Email Address</Label>
                                            <div className="relative">
                                                <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                                                <Input id="email" type="email" placeholder="m@example.com" defaultValue="admin@courierhub.com" className="pl-9" />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <Separator />

                                <div className="flex justify-end">
                                    <Button onClick={handleSave} disabled={isLoading} className="bg-blue-600 hover:bg-blue-700">
                                        {isLoading ? "Saving..." : <><Save className="w-4 h-4 mr-2" /> Save Changes</>}
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>
                </TabsContent>

                <TabsContent value="security">
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="grid gap-6"
                    >
                        <Card>
                            <CardHeader>
                                <CardTitle>Password & Security</CardTitle>
                                <CardDescription>Manage your password and security settings.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="space-y-4 max-w-md">
                                    <div className="grid gap-2">
                                        <Label htmlFor="current-password">Current Password</Label>
                                        <Input id="current-password" type="password" />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="new-password">New Password</Label>
                                        <Input id="new-password" type="password" />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label htmlFor="confirm-password">Confirm Password</Label>
                                        <Input id="confirm-password" type="password" />
                                    </div>
                                </div>

                                <Separator />

                                <div className="flex items-center justify-between p-4 border border-blue-100 bg-blue-50/50 rounded-lg">
                                    <div className="flex items-center gap-4">
                                        <div className="p-2 bg-blue-100 rounded-full text-blue-600">
                                            <Shield className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-blue-900">Two-factor Authentication</p>
                                            <p className="text-xs text-blue-700/80">Add an extra layer of security to your account.</p>
                                        </div>
                                    </div>
                                    <Button variant="outline" className="border-blue-200 text-blue-700 hover:bg-blue-100 bg-white">
                                        Enable
                                    </Button>
                                </div>

                                <div className="flex justify-end pt-4">
                                    <Button onClick={handleSave} disabled={isLoading} className="bg-blue-600 hover:bg-blue-700">
                                        {isLoading ? "Updating..." : "Update Password"}
                                    </Button>
                                </div>
                                <div className="pt-6 border-t mt-6">
                                    <Button variant="destructive" className="w-full sm:w-auto">
                                        <LogOut className="mr-2 h-4 w-4" />
                                        Log out
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>
                </TabsContent>
            </Tabs>
        </div>
    );
}
