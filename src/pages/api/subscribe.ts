import { NextApiRequest, NextApiResponse } from "next";
import { query as q } from 'faunadb'
import { getSession } from "next-auth/react"; 
import { fauna } from "../../services/fauna";
import { stripe } from "../../services/stripe";

type User = {
    ref: {
        id: string;
    }
    data: {
        stripe_costumer_id: string
    }
}

/* eslint import/no-anonymous-default-export: [2, {"allowArrowFunction": true}] */
export default async (req: NextApiRequest, res: NextApiResponse) => {
    if (req.method === 'POST') { //aqui está verificando se o request esta em post
        
        const session = await getSession({ req }) //aqui puxa as informaçoes do usuario 

        const user = await fauna.query<User>(
            q.Get(
                q.Match(
                    q.Index('user_by_email'),
                    q.Casefold(session.user.email)
                )
            )
        )

        let customerId = user.data.stripe_costumer_id

        if (!customerId) {
            const stripeCustomer = await stripe.customers.create({
                email: session.user.email,
            })
            await fauna.query(
                q.Update(
                    q.Ref(q.Collection('users'), user.ref.id),
                    {
                        data: {
                            stripe_customer_id: stripeCustomer.id,
                        }
                    }
                )
            )
        customerId = stripeCustomer.id
        
    }

        const stripeCheckoutSession = await stripe.checkout.sessions.create({ //essa funçao é do pagamento
            customer: customerId, //aqui pega a informaçao do usuario pelo id
            payment_method_types: ['card'], //aqui determina que o pagamento é no cartao
            billing_address_collection: 'required', // aqui determina é necessario colocar o endereço
            line_items: [ //lista de itens que podem aparecer no pagamento
                { price: 'price_1Kf9hdIZzTjCCGFvaM4H878O', quantity: 1}, //aqui determina a chave do produto e quantidade
            ],
            mode: 'subscription', //permite pagamento recorrente
            allow_promotion_codes: true, //aqui permite ter codigo promocionais
            success_url: process.env.STRIPE_SUCCESS_URL, //aqui encaminha para um endereço se der certo
            cancel_url: process.env.STRIPE_CANCEL_URL //aqui encaminha para um endereço se der cancelado
        })

        return res.status(200).json({ sessionId: stripeCheckoutSession.id })// aqui retorna que deu certo 

    }else {
        res.setHeader('Allow', 'POST')
        res.status(405).end('Method not allowed')
    }
}