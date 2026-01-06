// Seed Script - Populate Firebase with initial test data
// Run this script once to add sample data to your Firebase Firestore
// Usage: Create an admin user in Firebase Auth first, then call this function

import { collection, addDoc, Timestamp, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebaseConfig';

/**
 * Seed initial courier API configurations
 */
export const seedCouriers = async () => {
    const couriers = [
        {
            name: 'dtdc',
            displayName: 'DTDC',
            status: 'active',
            isConnected: true,
            color: 'bg-red-500',
            lastSync: Timestamp.now(),
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now()
        },
        {
            name: 'bluedart',
            displayName: 'Blue Dart',
            status: 'active',
            isConnected: true,
            color: 'bg-blue-500',
            lastSync: Timestamp.now(),
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now()
        },
        {
            name: 'del human',
            displayName: 'Delhivery',
            status: 'active',
            isConnected: true,
            color: 'bg-orange-500',
            lastSync: Timestamp.now(),
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now()
        },
        {
            name: 'indiapost',
            displayName: 'India Post',
            status: 'active',
            isConnected: true,
            color: 'bg-green-600',
            lastSync: Timestamp.now(),
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now()
        },
        {
            name: 'ecomexpress',
            displayName: 'Ecom Express',
            status: 'inactive',
            isConnected: true,
            color: 'bg-purple-500',
            lastSync: Timestamp.now(),
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now()
        },
        {
            name: 'shadowfax',
            displayName: 'Shadowfax',
            status: 'active',
            isConnected: true,
            color: 'bg-gray-700',
            lastSync: Timestamp.now(),
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now()
        }
    ];

    try {
        for (const courier of couriers) {
            await addDoc(collection(db, 'courierAPIs'), courier);
        }
        console.log('✅ Couriers seeded successfully');
    } catch (error) {
        console.error('❌ Error seeding couriers:', error);
    }
};

/**
 * Seed initial clients
 */
export const seedClients = async () => {
    const clients = [
        {
            name: 'Express Logistics Pvt Ltd',
            email: 'contact@expresslog.in',
            phone: '+91-9988776655',
            type: 'franchise',
            status: 'active',
            marginType: 'flat',
            marginValue: 20,
            allowedCouriers: ['DTDC', 'Blue Dart', 'Delhivery'],
            walletBalance: 42100,
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now()
        },
        {
            name: 'QuickShip Enterprises',
            email: 'contact@quickship.in',
            phone: '+91-9876543210',
            type: 'franchise',
            status: 'active',
            marginType: 'flat',
            marginValue: 15,
            allowedCouriers: ['DTDC', 'Delhivery', 'India Post'],
            walletBalance: 25430,
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now()
        },
        {
            name: 'Metro Courier Services',
            email: 'info@metrocourier.co.in',
            phone: '+91-9123456789',
            type: 'franchise',
            status: 'active',
            marginType: 'percentage',
            marginValue: 10,
            allowedCouriers: ['Blue Dart', 'DTDC', 'Shadowfax'],
            walletBalance: 18950,
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now()
        },
        {
            name: 'FashionHub Store',
            email: 'store@fashionhub.in',
            phone: '+91-9876501234',
            type: 'shopify',
            status: 'active',
            marginType: 'percentage',
            marginValue: 12,
            allowedCouriers: ['Blue Dart', 'Delhivery', 'Ecom Express'],
            walletBalance: 22340,
            shopifyStoreUrl: 'fashionhub.myshopify.com',
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now()
        },
        {
            name: 'TechGadgets India',
            email: 'support@techgadgets.in',
            phone: '+91-9988712345',
            type: 'shopify',
            status: 'active',
            marginType: 'percentage',
            marginValue: 15,
            allowedCouriers: ['Blue Dart', 'India Post', 'Delhivery'],
            walletBalance: 28920,
            shopifyStoreUrl: 'techgadgets.myshopify.com',
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now()
        },
        {
            name: 'HomeDecor Hub',
            email: 'orders@homedecor.in',
            phone: '+91-9123487654',
            type: 'shopify',
            status: 'active',
            marginType: 'flat',
            marginValue: 18,
            allowedCouriers: ['DTDC', 'Delhivery', 'Blue Dart'],
            walletBalance: 15670,
            shopifyStoreUrl: 'homedecor.myshopify.com',
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now()
        }
    ];

    try {
        for (const client of clients) {
            await addDoc(collection(db, 'clients'), client);
        }
        console.log('✅ Clients seeded successfully');
    } catch (error) {
        console.error('❌ Error seeding clients:', error);
    }
};

/**
 * Seed initial shipments
 */
export const seedShipments = async (clientDocs: any[]) => {
    const statuses = ['delivered', 'transit', 'pending', 'cancelled'];
    const couriers = ['DTDC', 'Blue Dart', 'Delhivery', 'India Post'];
    const cities = [
        { name: 'Mumbai', pincode: '400001' },
        { name: 'Delhi', pincode: '110001' },
        { name: 'Bangalore', pincode: '560001' },
        { name: 'Chennai', pincode: '600001' },
        { name: 'Pune', pincode: '411001' },
        { name: 'Ahmedabad', pincode: '380001' }
    ];

    try {
        for (let i = 0; i < 20; i++) {
            const client = clientDocs[Math.floor(Math.random() * clientDocs.length)];
            const origin = cities[Math.floor(Math.random() * cities.length)];
            const dest = cities[Math.floor(Math.random() * cities.length)];
            const courier = couriers[Math.floor(Math.random() * couriers.length)];
            const status = statuses[Math.floor(Math.random() * statuses.length)];
            const courierCharge = Math.floor(Math.random() * 300) + 100;
            const marginAmount = Math.floor(Math.random() * 50) + 20;

            const shipment: any = {
                clientId: client.id,
                clientName: client.name,
                clientType: client.type,
                courier,
                status,
                origin: {
                    city: origin.name,
                    pincode: origin.pincode
                },
                destination: {
                    city: dest.name,
                    pincode: dest.pincode
                },
                weight: Math.floor(Math.random() * 5) + 0.5,
                courierCharge,
                chargedAmount: courierCharge + marginAmount,
                marginAmount,
                createdAt: Timestamp.fromDate(new Date(Date.now() - Math.floor(Math.random() * 7 * 24 * 60 * 60 * 1000))),
                updatedAt: Timestamp.now()
            };

            if (status === 'delivered') {
                shipment.deliveredAt = Timestamp.now();
            }

            await addDoc(collection(db, 'shipments'), shipment);
        }
        console.log('✅ Shipments seeded successfully');
    } catch (error) {
        console.error('❌ Error seeding shipments:', error);
    }
};

/**
 * Main seed function - run this to seed all data
 */
export const seedAllData = async () => {
    console.log('🌱 Starting data seeding...');

    try {
        await seedCouriers();
        await seedClients();

        // Fetch clients to use for shipments
        const clientsSnapshot = await getDocs(collection(db, 'clients'));
        const clientDocs = clientsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        await seedShipments(clientDocs);

        console.log('✅ All data seeded successfully!');
        console.log('📝 Note: Make sure to create an admin user in Firebase Authentication');
        console.log('   Email: admin@courierhub.com');
        console.log('   Password: (your choice)');
    } catch (error) {
        console.error('❌ Error during seeding:', error);
    }
};

// Uncomment the line below and run in browser console to seed data
// seedAllData();
