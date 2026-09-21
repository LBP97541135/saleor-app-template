import { useAppBridge } from "@saleor/app-sdk/app-bridge";
import { Box, Button, Input, Text, Select, Spinner } from "@saleor/macaw-ui";
import { NextPage } from "next";
import { useState, useEffect, ChangeEvent } from "react";
import { useMutation, useQuery } from "urql";
import gql from "graphql-tag";

const BUDGET_LIMIT_KEY = "budgetLimit";
const BUDGET_RESET_PERIOD_KEY = "budgetResetPeriod";
const CURRENT_SPEND_KEY = "currentSpend";
const RESET_DATE_KEY = "resetDate";

const GET_APP_METADATA = gql`
  query GetAppMetadata($id: ID!) {
    app(id: $id) {
      id
      privateMetadata {
        key
        value
      }
    }
  }
`;

const UPDATE_APP_METADATA = gql`
  mutation UpdateAppMetadata($id: ID!, $input: [MetadataInput!]!) {
    updatePrivateMetadata(id: $id, input: $input) {
      errors {
        field
        message
        code
      }
    }
  }
`;

type BudgetResetPeriod = "DAILY" | "WEEKLY" | "MONTHLY" | "UNLIMITED";

interface BudgetSettings {
  budgetLimit: string;
  budgetResetPeriod: BudgetResetPeriod;
  currentSpend: string;
  resetDate: string;
}

const defaultSettings: BudgetSettings = {
  budgetLimit: "",
  budgetResetPeriod: "MONTHLY",
  currentSpend: "0",
  resetDate: "",
};

const BudgetSettingsPage: NextPage = () => {
  const { appBridge, appBridgeState } = useAppBridge();
  const [settings, setSettings] = useState<BudgetSettings>(defaultSettings);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const appId = appBridgeState?.id || "";

  const [{ data, fetching }] = useQuery({
    query: GET_APP_METADATA,
    variables: { id: appId },
    pause: !appId,
  });

  useEffect(() => {
    if (data?.app?.privateMetadata) {
      const metadata = data.app.privateMetadata;
      const newSettings = { ...defaultSettings };
      
      metadata.forEach((item: { key: string; value: string }) => {
        switch (item.key) {
          case BUDGET_LIMIT_KEY:
            newSettings.budgetLimit = item.value;
            break;
          case BUDGET_RESET_PERIOD_KEY:
            newSettings.budgetResetPeriod = item.value as BudgetResetPeriod;
            break;
          case CURRENT_SPEND_KEY:
            newSettings.currentSpend = item.value;
            break;
          case RESET_DATE_KEY:
            newSettings.resetDate = item.value;
            break;
        }
      });
      
      setSettings(newSettings);
    }
  }, [data]);

  const [, updateMetadata] = useMutation(UPDATE_APP_METADATA);

  const handleSave = async () => {
    if (!appId) return;
    
    setIsSaving(true);
    setSaveStatus(null);

    try {
      const input = [
        { key: BUDGET_LIMIT_KEY, value: settings.budgetLimit },
        { key: BUDGET_RESET_PERIOD_KEY, value: settings.budgetResetPeriod },
        { key: CURRENT_SPEND_KEY, value: settings.currentSpend },
        { key: RESET_DATE_KEY, value: settings.resetDate || new Date().toISOString() },
      ];

      const result = await updateMetadata({ id: appId, input });

      if (result.error) {
        setSaveStatus({ type: "error", text: result.error.message });
      } else {
        setSaveStatus({ type: "success", text: "Budget settings saved successfully!" });
        
        if (appBridge) {
          appBridge.dispatch({
            type: "notification",
            payload: {
              status: "success",
              title: "Settings saved",
              text: "Budget guardrail settings have been updated.",
              actionId: "settings-saved",
            },
          });
        }
      }
    } catch (err) {
      setSaveStatus({ type: "error", text: "Failed to save settings. Please try again." });
    } finally {
      setIsSaving(false);
    }
  };

  const handleInputChange = (field: keyof BudgetSettings, value: string) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
  };

  const handleNumberChange = (e: ChangeEvent<HTMLInputElement>, field: keyof BudgetSettings) => {
    handleInputChange(field, e.target.value);
  };

  const handleSelectChange = (e: ChangeEvent<HTMLSelectElement>, field: keyof BudgetSettings) => {
    handleInputChange(field, e.target.value);
  };

  if (!appBridgeState?.ready) {
    return (
      <Box padding={8} display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <Spinner />
      </Box>
    );
  }

  if (fetching && !data) {
    return (
      <Box padding={8} display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <Spinner />
      </Box>
    );
  }

  return (
    <Box padding={8} __maxWidth="800px">
      <Text as="h1" size={10} marginBottom={2}>
        Budget Guardrail Settings
      </Text>
      <Text as="p" color="default2" marginBottom={8}>
        Configure budget limits to control API usage and prevent unexpected costs.
      </Text>

      {saveStatus && (
        <Box 
          padding={4} 
          marginBottom={6} 
          borderRadius={4}
          backgroundColor={saveStatus.type === "success" ? "success1" : "critical1"}
        >
          <Text color={saveStatus.type === "success" ? "success1" : "critical1"}>
            {saveStatus.text}
          </Text>
        </Box>
      )}

      <Box
        display="grid"
        gap={6}
        padding={6}
        backgroundColor="surfaceNeutralPlainDefault"
        borderRadius={4}
        borderWidth={1}
        borderStyle="solid"
        borderColor="default1"
      >
        <Text as="h2" size={7} marginBottom={2}>
          Budget Configuration
        </Text>

        <Box display="grid" gap={4} __gridTemplateColumns="1fr 1fr">
          <Box>
            <Text as="label" display="block" marginBottom={2} fontWeight="bold">
              Budget Limit
            </Text>
            <Input
              type="number"
              min="0"
              step="0.01"
              placeholder="Enter budget limit"
              value={settings.budgetLimit}
              onChange={(e: ChangeEvent<HTMLInputElement>) => handleNumberChange(e, "budgetLimit")}
              helperText="Maximum amount allowed in the billing period"
            />
          </Box>

          <Box>
            <Text as="label" display="block" marginBottom={2} fontWeight="bold">
              Budget Reset Period
            </Text>
            <Select
              value={settings.budgetResetPeriod}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => handleSelectChange(e, "budgetResetPeriod")}
              options={[
                { label: "Daily", value: "DAILY" },
                { label: "Weekly", value: "WEEKLY" },
                { label: "Monthly", value: "MONTHLY" },
                { label: "Unlimited", value: "UNLIMITED" },
              ]}
            />
            <Text as="span" display="block" marginTop={1} fontSize="small" color="default2">
              How often the budget counter resets
            </Text>
          </Box>
        </Box>

        <Button
          variant="primary"
          onClick={handleSave}
          disabled={isSaving}
          alignSelf="start"
        >
          {isSaving ? "Saving..." : "Save Settings"}
        </Button>
      </Box>

      <Box
        display="grid"
        gap={6}
        padding={6}
        marginTop={6}
        backgroundColor="surfaceNeutralPlainDefault"
        borderRadius={4}
        borderWidth={1}
        borderStyle="solid"
        borderColor="default1"
      >
        <Text as="h2" size={7} marginBottom={2}>
          Current Budget Status
        </Text>

        <Box display="grid" gap={4} __gridTemplateColumns="1fr 1fr 1fr">
          <Box padding={4} backgroundColor="surfaceNeutralHighlight" borderRadius={2}>
            <Text as="span" display="block" color="default2" fontSize="small">
              Current Spend
            </Text>
            <Text as="p" size={8} fontWeight="bold">
              ${settings.currentSpend || "0"}
            </Text>
          </Box>

          <Box padding={4} backgroundColor="surfaceNeutralHighlight" borderRadius={2}>
            <Text as="span" display="block" color="default2" fontSize="small">
              Budget Limit
            </Text>
            <Text as="p" size={8} fontWeight="bold">
              {settings.budgetLimit ? `$${settings.budgetLimit}` : "Not set"}
            </Text>
          </Box>

          <Box padding={4} backgroundColor="surfaceNeutralHighlight" borderRadius={2}>
            <Text as="span" display="block" color="default2" fontSize="small">
              Remaining Budget
            </Text>
            <Text as="p" size={8} fontWeight="bold">
              {settings.budgetLimit 
                ? `$${(parseFloat(settings.budgetLimit) - parseFloat(settings.currentSpend || "0")).toFixed(2)}`
                : "∞"}
            </Text>
          </Box>
        </Box>

        <Box display="grid" gap={4} __gridTemplateColumns="1fr 1fr" marginTop={2}>
          <Box>
            <Text as="span" display="block" color="default2" fontSize="small">
              Reset Period
            </Text>
            <Text as="p" fontWeight="bold">
              {settings.budgetResetPeriod === "UNLIMITED" 
                ? "Unlimited" 
                : settings.budgetResetPeriod.toLowerCase()}
            </Text>
          </Box>

          <Box>
            <Text as="span" display="block" color="default2" fontSize="small">
              Last Reset
            </Text>
            <Text as="p" fontWeight="bold">
              {settings.resetDate 
                ? new Date(settings.resetDate).toLocaleDateString() 
                : "Never"}
            </Text>
          </Box>
        </Box>

        {settings.budgetLimit && (
          <Box marginTop={4}>
            <Text as="span" display="block" color="default2" fontSize="small" marginBottom={2}>
              Usage
            </Text>
            <Box 
              height={8} 
              backgroundColor="surfaceNeutralDefault" 
              borderRadius={4} 
              overflow="hidden"
            >
              <Box 
                height="100%" 
                backgroundColor={
                  (parseFloat(settings.currentSpend || "0") / parseFloat(settings.budgetLimit)) > 0.9
                    ? "critical1"
                    : (parseFloat(settings.currentSpend || "0") / parseFloat(settings.budgetLimit)) > 0.7
                    ? "warning1"
                    : "success1"
                }
                width={`${Math.min(
                  (parseFloat(settings.currentSpend || "0") / parseFloat(settings.budgetLimit)) * 100,
                  100
                )}%`}
                transition="width 0.3s ease"
              />
            </Box>
            <Text as="p" fontSize="small" color="default2" marginTop={1}>
              {((parseFloat(settings.currentSpend || "0") / parseFloat(settings.budgetLimit)) * 100).toFixed(1)}% used
            </Text>
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default BudgetSettingsPage;
