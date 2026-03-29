declare module 'react-native-razorpay' {
  interface RazorpayOptions {
    key: string
    amount: number
    currency: string
    order_id: string
    name?: string
    description?: string
    image?: string
    prefill?: {
      name?: string
      email?: string
      contact?: string
    }
    theme?: {
      color?: string
    }
  }

  interface RazorpaySuccess {
    razorpay_payment_id: string
    razorpay_order_id: string
    razorpay_signature: string
  }

  const RazorpayCheckout: {
    open(options: RazorpayOptions): Promise<RazorpaySuccess>
  }

  export default RazorpayCheckout
}
