// app/help.tsx
import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    Linking,
    Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors } from '../theme';
import { Fonts } from '../font';
import { openExternalUrl } from './utils/openExternalUrl';

type HelpItem = {
    icon: string;
    title: string;
    description: string;
    action: () => void;
};

export default function HelpScreen() {
    const router = useRouter();

    const handleCallSupport = () => {
        const phoneNumber = '+22997000000'; // Remplacer par le vrai numéro
        Linking.openURL(`tel:${phoneNumber}`).catch(() =>
            Alert.alert('Erreur', "Impossible d'ouvrir l'application Téléphone.")
        );
    };

    const handleEmailSupport = () => {
        const email = 'support@kekenon.com';
        const subject = 'Demande d\'aide - Application Chauffeur';
        Linking.openURL(`mailto:${email}?subject=${encodeURIComponent(subject)}`).catch(() =>
            Alert.alert('Erreur', "Impossible d'ouvrir l'application Email.")
        );
    };

    const handleWhatsAppSupport = () => {
        const phoneNumber = '22997000000'; // Remplacer par le vrai numéro
        const message = 'Bonjour, j\'ai besoin d\'aide avec l\'application chauffeur.';
    void openExternalUrl(`https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`).then((ok) => {
      if (!ok) Alert.alert('Erreur', "Impossible d'ouvrir WhatsApp.");
    });
    };

    const BASE_URL = 'https://kekenon.com';

    const handleOpenFAQ = () => {
    void openExternalUrl(`${BASE_URL}/faq`).then((ok) => {
      if (!ok) Alert.alert('Erreur', 'Impossible d\'ouvrir la page.');
    });
    };

    const handleOpenTerms = () => {
    void openExternalUrl(`${BASE_URL}/cgu`).then((ok) => {
      if (!ok) Alert.alert('Erreur', 'Impossible d\'ouvrir la page.');
    });
    };

    const handleOpenPrivacy = () => {
    void openExternalUrl(`${BASE_URL}/confidentialite`).then((ok) => {
      if (!ok) Alert.alert('Erreur', 'Impossible d\'ouvrir la page.');
    });
    };

    const helpItems: HelpItem[] = [
        {
            icon: 'call',
            title: 'Appeler le support',
            description: 'Contactez-nous par téléphone',
            action: handleCallSupport,
        },
        {
            icon: 'mail',
            title: 'Envoyer un email',
            description: 'Envoyez-nous un message',
            action: handleEmailSupport,
        },
        {
            icon: 'logo-whatsapp',
            title: 'WhatsApp',
            description: 'Chattez avec nous sur WhatsApp',
            action: handleWhatsAppSupport,
        },
        {
            icon: 'help-circle',
            title: 'FAQ',
            description: 'Questions fréquemment posées',
            action: handleOpenFAQ,
        },
    ];

    const legalItems: HelpItem[] = [
        {
            icon: 'document-text',
            title: 'Conditions d\'utilisation',
            description: 'Consultez nos conditions',
            action: handleOpenTerms,
        },
        {
            icon: 'shield-checkmark',
            title: 'Politique de confidentialité',
            description: 'Comment nous protégeons vos données',
            action: handleOpenPrivacy,
        },
    ];

    return (
        <SafeAreaView style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color={Colors.black} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Aide et Support</Text>
                <View style={{ width: 24 }} />
            </View>

            <ScrollView contentContainerStyle={styles.content}>
                {/* Support Section */}
                <Text style={styles.sectionTitle}>Contactez-nous</Text>
                <View style={styles.card}>
                    {helpItems.map((item, index) => (
                        <React.Fragment key={item.title}>
                            <TouchableOpacity style={styles.menuRow} onPress={item.action}>
                                <View style={styles.iconContainer}>
                                    <Ionicons name={item.icon as any} size={24} color={Colors.primary} />
                                </View>
                                <View style={styles.textContainer}>
                                    <Text style={styles.menuTitle}>{item.title}</Text>
                                    <Text style={styles.menuDescription}>{item.description}</Text>
                                </View>
                                <Ionicons name="chevron-forward" size={20} color={Colors.gray} />
                            </TouchableOpacity>
                            {index < helpItems.length - 1 && <View style={styles.separator} />}
                        </React.Fragment>
                    ))}
                </View>

                {/* Legal Section */}
                <Text style={styles.sectionTitle}>Informations légales</Text>
                <View style={styles.card}>
                    {legalItems.map((item, index) => (
                        <React.Fragment key={item.title}>
                            <TouchableOpacity style={styles.menuRow} onPress={item.action}>
                                <View style={styles.iconContainer}>
                                    <Ionicons name={item.icon as any} size={24} color={Colors.primary} />
                                </View>
                                <View style={styles.textContainer}>
                                    <Text style={styles.menuTitle}>{item.title}</Text>
                                    <Text style={styles.menuDescription}>{item.description}</Text>
                                </View>
                                <Ionicons name="chevron-forward" size={20} color={Colors.gray} />
                            </TouchableOpacity>
                            {index < legalItems.length - 1 && <View style={styles.separator} />}
                        </React.Fragment>
                    ))}
                </View>

                {/* App Info */}
                <View style={styles.appInfo}>
                    <Text style={styles.appInfoText}>Kêkênon Chauffeur</Text>
                    <Text style={styles.appInfoVersion}>Version 1.0.3</Text>
                    <Text style={styles.appInfoCopyright}>© 2026 Kêkênon. Tous droits réservés.</Text>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 16,
        backgroundColor: 'white',
        borderBottomWidth: 1,
        borderBottomColor: Colors.lightGray,
    },
    backButton: {
        padding: 4,
    },
    headerTitle: {
        fontFamily: Fonts.titilliumWebBold,
        fontSize: 18,
        color: Colors.black,
    },
    content: {
        padding: 20,
        paddingBottom: 40,
    },
    sectionTitle: {
        fontFamily: Fonts.titilliumWebBold,
        fontSize: 16,
        color: Colors.gray,
        marginBottom: 12,
        marginTop: 8,
        textTransform: 'uppercase',
    },
    card: {
        backgroundColor: 'white',
        borderRadius: 16,
        marginBottom: 24,
        overflow: 'hidden',
    },
    menuRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 16,
    },
    iconContainer: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: Colors.primary + '15',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    textContainer: {
        flex: 1,
    },
    menuTitle: {
        fontFamily: Fonts.titilliumWebBold,
        fontSize: 16,
        color: Colors.black,
        marginBottom: 2,
    },
    menuDescription: {
        fontFamily: Fonts.titilliumWeb,
        fontSize: 13,
        color: Colors.gray,
    },
    separator: {
        height: 1,
        backgroundColor: Colors.lightGray,
        marginLeft: 68,
    },
    appInfo: {
        alignItems: 'center',
        marginTop: 20,
        paddingVertical: 20,
    },
    appInfoText: {
        fontFamily: Fonts.titilliumWebBold,
        fontSize: 16,
        color: Colors.black,
        marginBottom: 4,
    },
    appInfoVersion: {
        fontFamily: Fonts.titilliumWeb,
        fontSize: 14,
        color: Colors.gray,
        marginBottom: 8,
    },
    appInfoCopyright: {
        fontFamily: Fonts.titilliumWeb,
        fontSize: 12,
        color: Colors.gray,
    },
});
