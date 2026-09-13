"use client";

import { useState } from "react";
import type {Fragrance} from "@/features/fragrances/types/fragrance.types"

type FragranceCardProps = {
    fragrance: Fragrance;
}


export default function FragranceCard({fragrance}: FragranceCardProps) {
    const [count, setCount] = useState(0)
    return (
        <li>
            <h2>{fragrance.name}</h2>
            <p>${fragrance.price}</p>
            <p> Cantidad: {count}</p>
            <button onClick={() => setCount(count + 1)}>
                +
            </button>
            <button onClick={() => (count > 0 ? setCount(count - 1) : setCount(0))}>
                -
            </button>
        </li>
    )
}