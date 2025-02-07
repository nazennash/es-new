import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loadStripe } from '@stripe/stripe-js';
import { PayPalButtons } from '@paypal/react-paypal-js';
import { FaCrown, FaCheck } from 'react-icons/fa';
import { doc, setDoc, getFirestore } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import toast from 'react-hot-toast';

// Initialize Stripe with the public key from environment variables
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY);

// Initialize Firestore
const db = getFirestore();

// Initialize Cloud Functions
const functions = getFunctions();

const plans = [
  {
    id: 'basic',
    name: 'Basic',
    price: 4.99,
    features: [
      'Access to all basic puzzles',
      'Save progress',
      'Basic leaderboard access',
    ],
    color: 'blue',
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 9.99,
    features: [
      'All Basic features',
      'Custom puzzle creation',
      'Ad-free experience',
      'Priority support',
    ],
    color: 'purple',
    popular: true,
  },
  {
    id: 'premium',
    name: 'Premium',
    price: 19.99,
    features: [
      'All Pro features',
      'Multiplayer access',
      'Exclusive puzzle themes',
      'Advanced statistics',
      'Priority support',
    ],
    color: 'gold',
  },
];

const PaymentPlans = ({ user }) => {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleStripePayment = async (planId) => {
    setLoading(true);
    try {
      // Get the Stripe instance
      const stripe = await stripePromise;

      // Call the createCheckoutSession function provided by the Firestore Stripe Payments Extension
      const createCheckoutSession = httpsCallable(
        functions,
        'ext-firestore-stripe-payments-createCheckoutSession'
      );

      // Find the selected plan
      const plan = plans.find((p) => p.id === planId);

      // Create the Checkout session
      const result = await createCheckoutSession({
        price: plan.price * 100, // Convert to cents
        success_url: `${window.location.origin}/payment-success`, // Redirect URL after successful payment
        cancel_url: `${window.location.origin}/payment-canceled`, // Redirect URL if payment is canceled
        mode: 'payment', // Use 'subscription' for recurring payments
        metadata: {
          planId, // Pass the plan ID as metadata
        },
      });

      // Redirect to the Stripe Checkout page
      const { error } = await stripe.redirectToCheckout({
        sessionId: result.data.sessionId,
      });

      if (error) {
        toast.error(error.message);
      }
    } catch (error) {
      console.error('Payment error:', error);
      toast.error('Payment failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handlePayPalPayment = async (plan) => {
    return {
      createOrder: async (data, actions) => {
        return actions.order.create({
          purchase_units: [
            {
              amount: {
                value: plan.price.toString(),
                currency_code: 'USD',
              },
              description: `${plan.name} Plan Subscription`,
            },
          ],
        });
      },
      onApprove: async (data, actions) => {
        const order = await actions.order.capture();
        await handleSuccessfulPayment(plan.id, 'paypal', order.id);
        toast.success('Payment successful!');
        navigate('/payment-success');
      },
      onError: (err) => {
        console.error('PayPal error:', err);
        toast.error('Payment failed. Please try again.');
      },
    };
  };

  const handleSuccessfulPayment = async (planId, provider, transactionId) => {
    try {
      await setDoc(doc(db, 'subscriptions', user.uid), {
        planId,
        provider,
        transactionId,
        startDate: new Date().toISOString(),
        status: 'active',
      });
    } catch (error) {
      console.error('Error updating subscription:', error);
    }
  };

  return (
    <div className="py-12 bg-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <h2 className="text-3xl font-extrabold text-gray-900 sm:text-4xl">
            Choose Your Plan
          </h2>
          <p className="mt-4 text-xl text-gray-600">
            Unlock premium features and enhance your puzzle experience
          </p>
        </div>

        <div className="mt-12 grid gap-8 lg:grid-cols-3">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`relative bg-white rounded-lg shadow-lg overflow-hidden transform transition-transform hover:scale-105 ${plan.popular ? 'ring-2 ring-' + plan.color + '-500' : ''
                }`}
            >
              {plan.popular && (
                <div
                  className={`absolute top-0 right-0 bg-${plan.color}-500 text-white px-4 py-1 rounded-bl-lg`}
                >
                  Popular
                </div>
              )}

              <div className="p-6">
                <h3 className="text-2xl font-bold text-gray-900">{plan.name}</h3>
                <div className="mt-4">
                  {plan.id !== 'basic' && ( // Apply discount only for Pro & Premium
                    <p className="text-sm text-green-600 font-semibold">
                      Get 20% off your first month when you subscribe today!
                    </p>
                  )}
                  <span className="text-4xl font-bold">
                    ${plan.id !== 'basic' ? (plan.price * 0.8).toFixed(2) : plan.price}
                  </span>
                  <span className="text-gray-500">/month</span>
                </div>


                <ul className="mt-6 space-y-4">
                  {plan.features.map((feature, index) => (
                    <li key={index} className="flex items-center">
                      <FaCheck className={`text-${plan.color}-500 mr-2`} />
                      <span className="text-gray-600">{feature}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-8 space-y-4">
                  {/* <button
                    onClick={() => handleStripePayment(plan.id)}
                    disabled={loading}
                    className={`w-full bg-${plan.color}-500 text-white py-2 px-4 rounded-md hover:bg-${plan.color}-600 transition duration-200`}
                  >
                    {loading ? 'Processing...' : 'Pay with Stripe'}
                  </button> */}

                  <PayPalButtons
                    createOrder={(data, actions) => {
                      return actions.order.create({
                        purchase_units: [
                          {
                            amount: {
                              value: plan.price.toString(),
                              currency_code: 'USD',
                            },
                            description: `${plan.name} Plan Subscription`,
                          },
                        ],
                      });
                    }}
                    onApprove={async (data, actions) => {
                      try {
                        const order = await actions.order.capture();
                        await handleSuccessfulPayment(plan.id, 'paypal', order.id);
                        toast.success('Payment successful!');
                        navigate('/payment-success');
                      } catch (error) {
                        console.error('Error capturing order:', error);
                        toast.error('Failed to complete payment.');
                      }
                    }}
                    onError={(err) => {
                      console.error('PayPal error:', err);
                      toast.error('Payment failed. Please try again.');
                    }}
                    style={{ layout: 'horizontal' }}
                    disabled={loading}
                  />


                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default PaymentPlans;