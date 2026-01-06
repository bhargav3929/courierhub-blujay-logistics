'use client';

import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-muted/30">
            <div className="text-center space-y-6 max-w-md mx-auto p-6">
                <h1 className="text-9xl font-black text-primary/20">404</h1>
                <h2 className="text-3xl font-bold tracking-tight">Page Not Found</h2>
                <p className="text-muted-foreground text-lg">
                    The page you are looking for doesn't exist or has been moved.
                </p>
                <div className="flex justify-center gap-4">
                    <Link href="/">
                        <Button size="lg" className="font-bold">
                            Go Home
                        </Button>
                    </Link>
                    <Button variant="outline" size="lg" onClick={() => window.history.back()}>
                        Go Back
                    </Button>
                </div>
            </div>
        </div>
    );
}
