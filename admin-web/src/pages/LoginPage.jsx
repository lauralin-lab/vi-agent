import { Button, Card, Typography, Alert, Space } from 'antd';
import { GoogleOutlined } from '@ant-design/icons';
import { useAuth } from '../hooks/useAuth';

const { Title, Text } = Typography;

const errorMessages = {
  not_admin: '无管理员权限，请联系系统管理员',
  user_not_found: '账号未注册，请先在 VI Agent App 中注册',
  login_failed: '登录失败，请重试',
  firebase_not_configured: 'Firebase 未配置，请设置 VITE_FIREBASE_* 环境变量后重新构建',
};

export default function LoginPage() {
  const { login, loading, error } = useAuth();

  const handleLogin = async () => {
    await login();
  };

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        background: '#f0f2f5',
      }}
    >
      <Card
        style={{ width: 400, textAlign: 'center' }}
        styles={{ body: { padding: 40 } }}
      >
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <Title level={2} style={{ marginBottom: 0 }}>
            VI Agent Admin
          </Title>

          {error && (
            <Alert
              type="error"
              message={errorMessages[error] || errorMessages.login_failed}
              showIcon
            />
          )}

          <Button
            type="primary"
            icon={<GoogleOutlined />}
            size="large"
            block
            loading={loading}
            onClick={handleLogin}
          >
            Sign in with Google
          </Button>

          <Text type="secondary">
            {'\u4ec5\u9650\u7ba1\u7406\u5458\u8d26\u53f7\u767b\u5f55'}
          </Text>
        </Space>
      </Card>
    </div>
  );
}
