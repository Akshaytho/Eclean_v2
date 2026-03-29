// RazorpayCheckout — WebView-based Razorpay payment
// Works in Expo Go (no native module needed) with fast refresh.
// Opens Razorpay's standard checkout in a modal WebView.

import React, { useRef } from 'react'
import { Modal, View, StyleSheet, ActivityIndicator, SafeAreaView, TouchableOpacity, Text } from 'react-native'
import { WebView } from 'react-native-webview'
import type { WebViewMessageEvent } from 'react-native-webview'
import { X } from 'lucide-react-native'

export interface RazorpayCheckoutOptions {
  keyId:       string
  orderId:     string
  amount:      number   // in paise
  currency:    string
  name:        string
  description: string
  prefill?: {
    name?:    string
    email?:   string
    contact?: string
  }
  themeColor?: string
}

export interface RazorpayPaymentResult {
  razorpay_payment_id: string
  razorpay_order_id:   string
  razorpay_signature:  string
}

interface Props {
  visible:   boolean
  options:   RazorpayCheckoutOptions
  onSuccess: (result: RazorpayPaymentResult) => void
  onError:   (error: { code?: string; description?: string }) => void
  onClose:   () => void
}

function buildCheckoutHtml(opts: RazorpayCheckoutOptions): string {
  const prefill = opts.prefill ?? {}
  return `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; background: #f5f5f5; display: flex; align-items: center; justify-content: center; min-height: 100vh; font-family: -apple-system, sans-serif; }
    .loading { text-align: center; color: #666; }
    .loading p { margin-top: 16px; font-size: 16px; }
  </style>
</head>
<body>
  <div class="loading">
    <p>Opening payment...</p>
  </div>
  <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
  <script>
    var options = {
      key:         "${opts.keyId}",
      amount:      ${opts.amount},
      currency:    "${opts.currency}",
      order_id:    "${opts.orderId}",
      name:        "${opts.name.replace(/"/g, '\\"')}",
      description: "${opts.description.replace(/"/g, '\\"')}",
      prefill: {
        name:    "${(prefill.name ?? '').replace(/"/g, '\\"')}",
        email:   "${(prefill.email ?? '').replace(/"/g, '\\"')}",
        contact: "${(prefill.contact ?? '').replace(/"/g, '\\"')}"
      },
      theme: { color: "${opts.themeColor ?? '#2563EB'}" },
      handler: function(response) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'success',
          data: response
        }));
      },
      modal: {
        ondismiss: function() {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'dismissed'
          }));
        },
        escape: false,
        confirm_close: true
      }
    };
    var rzp = new Razorpay(options);
    rzp.on('payment.failed', function(response) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'error',
        data: {
          code: response.error.code,
          description: response.error.description
        }
      }));
    });
    rzp.open();
  </script>
</body>
</html>`
}

export function RazorpayWebCheckout({ visible, options, onSuccess, onError, onClose }: Props) {
  const html = buildCheckoutHtml(options)

  const handleMessage = (event: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data)
      if (msg.type === 'success') {
        onSuccess(msg.data as RazorpayPaymentResult)
      } else if (msg.type === 'error') {
        onError(msg.data)
      } else if (msg.type === 'dismissed') {
        onClose()
      }
    } catch {
      // ignore parse errors
    }
  }

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent>
      <SafeAreaView style={s.root}>
        <View style={s.header}>
          <TouchableOpacity onPress={onClose} style={s.closeBtn}>
            <X size={22} color="#333" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Complete Payment</Text>
          <View style={{ width: 36 }} />
        </View>
        <WebView
          source={{ html }}
          style={s.webview}
          javaScriptEnabled
          domStorageEnabled
          onMessage={handleMessage}
          startInLoadingState
          renderLoading={() => (
            <View style={s.loader}>
              <ActivityIndicator size="large" color="#2563EB" />
            </View>
          )}
        />
      </SafeAreaView>
    </Modal>
  )
}

const s = StyleSheet.create({
  root:       { flex: 1, backgroundColor: '#fff' },
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#e5e5e5' },
  closeBtn:   { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle:{ fontSize: 16, fontWeight: '600', color: '#333' },
  webview:    { flex: 1 },
  loader:     { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
})
