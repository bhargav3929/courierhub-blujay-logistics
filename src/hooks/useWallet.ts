import { useState, useEffect } from 'react';

const WALLET_KEY = 'blujay_wallet_balance';
const INITIAL_BALANCE = 3000;

export const useWallet = () => {
    const [balance, setBalance] = useState<number>(() => {
        const saved = localStorage.getItem(WALLET_KEY);
        return saved !== null ? parseFloat(saved) : INITIAL_BALANCE;
    });

    useEffect(() => {
        localStorage.setItem(WALLET_KEY, balance.toString());
    }, [balance]);

    const addMoney = (amount: number) => {
        setBalance(prev => prev + amount);
    };

    const deductMoney = (amount: number) => {
        if (balance >= amount) {
            setBalance(prev => prev - amount);
            return true;
        }
        return false;
    };

    return { balance, addMoney, deductMoney };
};
