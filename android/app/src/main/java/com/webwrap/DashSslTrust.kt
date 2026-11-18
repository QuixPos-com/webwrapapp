package com.webwrap

import android.content.Context
import android.net.http.SslCertificate
import android.net.http.SslError
import android.util.Base64
import android.util.Log
import java.io.ByteArrayInputStream
import java.io.File
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate

/** Loads the app-stored local CA/leaf cert and decides whether WebView SSL errors may proceed. */
object DashSslTrust {
  const val CERT_FILE_NAME = "dash-local-ca.pem"
  private const val TAG = "DashSslTrust"

  fun certFile(context: Context): File = File(context.filesDir, CERT_FILE_NAME)

  fun isInstalled(context: Context): Boolean {
    val file = certFile(context)
    return file.isFile && file.length() > 0
  }

  fun clear(context: Context) {
    certFile(context).delete()
  }

  fun shouldProceed(context: Context, error: SslError): Boolean {
    val primary = error.primaryError
    if (primary != SslError.SSL_UNTRUSTED && primary != SslError.SSL_INVALID) {
      return false
    }
    val trusted = loadTrustedCerts(context)
    if (trusted.isEmpty()) {
      return false
    }
    val serverCert = sslCertificateToX509(error.certificate) ?: return false
    for (anchor in trusted) {
      if (serverCert.encoded.contentEquals(anchor.encoded)) {
        Log.i(TAG, "trusting leaf match for ${error.url}")
        return true
      }
      if (isSignedBy(serverCert, anchor)) {
        Log.i(TAG, "trusting CA-signed cert for ${error.url}")
        return true
      }
    }
    return false
  }

  fun loadTrustedCerts(context: Context): List<X509Certificate> {
    val file = certFile(context)
    if (!file.isFile || file.length() == 0L) {
      return emptyList()
    }
    return parseCertificates(file.readBytes())
  }

  fun parseCertificates(bytes: ByteArray): List<X509Certificate> {
    val factory = CertificateFactory.getInstance("X.509")
    val text = bytes.toString(Charsets.ISO_8859_1)
    val certs = ArrayList<X509Certificate>()

    if (text.contains("-----BEGIN CERTIFICATE-----")) {
      val regex =
          Regex(
              "-----BEGIN CERTIFICATE-----([A-Za-z0-9+/=\\s]+)-----END CERTIFICATE-----",
          )
      for (match in regex.findAll(text)) {
        val der = Base64.decode(match.groupValues[1].replace("\\s".toRegex(), ""), Base64.DEFAULT)
        certs.add(factory.generateCertificate(ByteArrayInputStream(der)) as X509Certificate)
      }
      if (certs.isNotEmpty()) {
        return certs
      }
    }

    try {
      val parsed = factory.generateCertificates(ByteArrayInputStream(bytes))
      for (cert in parsed) {
        if (cert is X509Certificate) {
          certs.add(cert)
        }
      }
    } catch (error: Exception) {
      Log.w(TAG, "failed to parse certificate bytes", error)
    }
    return certs
  }

  private fun isSignedBy(cert: X509Certificate, issuer: X509Certificate): Boolean {
    return try {
      cert.verify(issuer.publicKey)
      true
    } catch (_: Exception) {
      false
    }
  }

  private fun sslCertificateToX509(sslCert: SslCertificate?): X509Certificate? {
    if (sslCert == null) {
      return null
    }
    return try {
      val bundle = SslCertificate.saveState(sslCert)
      val bytes = bundle.getByteArray("x509-certificate") ?: return null
      val factory = CertificateFactory.getInstance("X.509")
      factory.generateCertificate(ByteArrayInputStream(bytes)) as X509Certificate
    } catch (error: Exception) {
      Log.w(TAG, "could not convert SslCertificate", error)
      null
    }
  }
}
